/**
 * TTS playback — hosted Edge (en-US-AriaNeural) only for consistent Aria voice.
 * Browser speechSynthesis is never used in the demo path.
 */

import { stripTags } from "@/lib/uiActions";
import {
  nextVoiceGeneration,
  currentVoiceGeneration,
  registerVoiceStop,
  unregisterVoiceStop,
  stopAllVoice,
} from "@/lib/ariaVoiceController";
import { getOnboardingWelcomeSpoken } from "@/lib/voiceCopy";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
const FADE_SEC = 0.025;
/** Edge cold-start can take ~20s — keep waiting rather than switching voices. */
const HOSTED_WAIT_MS = 30000;
const ARIA_VOICE = process.env.NEXT_PUBLIC_TTS_VOICE || "en-US-AriaNeural";

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentGain: GainNode | null = null;
let warmupPromise: Promise<void> | null = null;

const inflight = new Map<string, Promise<Blob>>();
const blobCache = new Map<string, Blob>();
const decodeCache = new Map<string, AudioBuffer>();

function ttsBody(text: string): Record<string, string> {
  const body: Record<string, string> = { text, voice: ARIA_VOICE };
  if (process.env.NEXT_PUBLIC_TTS_RATE) body.rate = process.env.NEXT_PUBLIC_TTS_RATE;
  if (process.env.NEXT_PUBLIC_TTS_PITCH) body.pitch = process.env.NEXT_PUBLIC_TTS_PITCH;
  return body;
}

function cacheKey(text: string): string {
  return text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx && audioCtx.state !== "closed") return audioCtx;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

export function getSharedAudioContext(): AudioContext | null {
  return getAudioContext();
}

export function isTtsPlaying(): boolean {
  return currentSource !== null;
}

function fadeOutAndStop(): void {
  const ctx = audioCtx;
  if (ctx && currentGain) {
    try {
      const now = ctx.currentTime;
      currentGain.gain.cancelScheduledValues(now);
      currentGain.gain.setValueAtTime(Math.max(0.0001, currentGain.gain.value), now);
      currentGain.gain.exponentialRampToValueAtTime(0.0001, now + FADE_SEC);
    } catch {
      /* ignore */
    }
  }
  const src = currentSource;
  currentSource = null;
  currentGain = null;
  if (src) {
    try {
      src.stop(ctx ? ctx.currentTime + FADE_SEC : 0);
    } catch {
      /* already stopped */
    }
  }
}

export function unlockAudioPlayback(): void {
  void getAudioContext()?.resume();
}

export async function fetchTtsBlob(text: string): Promise<Blob> {
  const clean = stripTags(text).trim();
  if (!clean) throw new Error("empty text");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HOSTED_WAIT_MS + 5000);

  try {
    const res = await fetch(`${BACKEND}/api/tts/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ttsBody(clean)),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`TTS unavailable (${res.status})`);
    const mime = res.headers.get("content-type") || "audio/mpeg";
    const raw = await res.blob();
    return new Blob([raw], { type: mime.split(";")[0] });
  } finally {
    clearTimeout(timer);
  }
}

async function getTtsBlob(text: string): Promise<Blob> {
  const clean = stripTags(text).trim();
  if (!clean) throw new Error("empty text");
  const key = cacheKey(clean);

  const cached = blobCache.get(key);
  if (cached) return cached;

  let promise = inflight.get(key);
  if (!promise) {
    promise = fetchTtsBlob(clean).then((blob) => {
      blobCache.set(key, blob);
      inflight.delete(key);
      return blob;
    });
    inflight.set(key, promise);
  }
  return promise;
}

/** Wait for hosted audio — never fall back to browser speech. */
async function ensureHostedBlob(text: string, maxMs = HOSTED_WAIT_MS): Promise<Blob | null> {
  const clean = stripTags(text).trim();
  if (!clean) return null;

  const cached = blobCache.get(cacheKey(clean));
  if (cached) return cached;

  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const blob = await getTtsBlob(clean);
      if (blob?.size) return blob;
    } catch {
      /* retry until deadline */
    }
    await sleep(400);
  }
  return null;
}

async function decodeBlob(text: string, blob: Blob): Promise<AudioBuffer> {
  const key = cacheKey(text);
  const hit = decodeCache.get(key);
  if (hit) return hit;

  const ctx = getAudioContext();
  if (!ctx) throw new Error("No AudioContext");
  await ctx.resume();

  const copy = await blob.arrayBuffer();
  const buffer = await ctx.decodeAudioData(copy.slice(0));
  decodeCache.set(key, buffer);
  return buffer;
}

export function prefetchTts(text: string): void {
  const clean = stripTags(text).trim();
  if (!clean) return;
  void getTtsBlob(clean).catch(() => {});
}

export function prefetchTtsLines(lines: string[]): void {
  lines.forEach((line) => prefetchTts(line));
}

export async function ensureTtsReady(text: string): Promise<void> {
  const blob = await ensureHostedBlob(text);
  if (!blob) throw new Error("hosted TTS not ready");
}

/** Prime Edge voice + welcome line so the first spoken line is not a different engine. */
export function warmAriaVoice(): Promise<void> {
  if (warmupPromise) return warmupPromise;
  warmupPromise = (async () => {
    prefetchTts("Aria voice ready.");
    prefetchTts(getOnboardingWelcomeSpoken());
    try {
      await ensureHostedBlob("Aria voice ready.", HOSTED_WAIT_MS);
    } catch {
      /* non-fatal */
    }
  })();
  return warmupPromise;
}

export interface SpeakTtsOptions {
  onPlaying?: () => void;
  audioRef?: { current: HTMLAudioElement | null };
  hostedWaitMs?: number;
}

function playBuffer(
  buffer: AudioBuffer,
  gen: number,
  options?: SpeakTtsOptions
): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return Promise.reject(new Error("No AudioContext"));
  if (gen !== currentVoiceGeneration()) return Promise.resolve();

  fadeOutAndStop();

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  const t0 = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(1, t0 + FADE_SEC);
  const dur = Math.max(buffer.duration, FADE_SEC * 3);
  gain.gain.setValueAtTime(1, t0 + Math.max(FADE_SEC, dur - FADE_SEC));
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  source.connect(gain);
  gain.connect(ctx.destination);
  currentSource = source;
  currentGain = gain;

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (currentSource === source) {
        currentSource = null;
        currentGain = null;
      }
      resolve();
    };

    const safety = window.setTimeout(finish, Math.ceil(dur * 1000) + 2000);
    source.onended = () => {
      window.clearTimeout(safety);
      finish();
    };

    options?.onPlaying?.();
    try {
      source.start(t0);
    } catch {
      window.clearTimeout(safety);
      finish();
    }
  });
}

export async function speakTts(text: string, options?: SpeakTtsOptions): Promise<void> {
  const clean = stripTags(text).trim();
  if (!clean) return;

  fadeOutAndStop();
  const gen = nextVoiceGeneration();
  void getAudioContext()?.resume();

  const localStop = () => {
    fadeOutAndStop();
    if (options?.audioRef) options.audioRef.current = null;
  };
  registerVoiceStop(localStop);

  try {
    const blob = await ensureHostedBlob(clean, options?.hostedWaitMs ?? HOSTED_WAIT_MS);
    if (!blob || gen !== currentVoiceGeneration()) return;

    const buffer = await decodeBlob(clean, blob);
    if (gen !== currentVoiceGeneration()) return;
    await getAudioContext()?.resume();
    await playBuffer(buffer, gen, options);
  } catch (err) {
    console.warn("[tts] hosted playback failed:", err);
  } finally {
    unregisterVoiceStop(localStop);
    if (options?.audioRef) options.audioRef.current = null;
  }
}

export function stopTtsPlayback(): void {
  stopAllVoice();
}

let voiceQueue: Promise<void> = Promise.resolve();

export function speakTtsQueued(text: string, options?: SpeakTtsOptions): Promise<void> {
  const run = () => speakTts(text, options);
  voiceQueue = voiceQueue.then(run, run);
  return voiceQueue;
}

export function speakScriptedQueued(
  text: string,
  options?: SpeakTtsOptions
): Promise<void> {
  return speakTtsQueued(text, { hostedWaitMs: HOSTED_WAIT_MS, ...options });
}

export async function waitForTtsIdle(maxMs = 60000): Promise<void> {
  const start = Date.now();
  while (isTtsPlaying() && Date.now() - start < maxMs) {
    await sleep(100);
  }
}

export function resetVoiceQueue(): void {
  voiceQueue = Promise.resolve();
}

export async function speakTtsSequence(
  lines: string[],
  options?: SpeakTtsOptions
): Promise<void> {
  const chunks = lines.map((l) => stripTags(l).trim()).filter(Boolean);
  if (!chunks.length) return;
  await speakTts(chunks.join(" "), options);
}
