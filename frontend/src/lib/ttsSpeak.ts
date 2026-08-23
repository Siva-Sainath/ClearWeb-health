/**
 * TTS playback: Groq/Edge clip when it arrives quickly, browser speech otherwise.
 */

import { stripTags } from "@/lib/uiActions";
import {
  nextVoiceGeneration,
  currentVoiceGeneration,
  registerVoiceStop,
  unregisterVoiceStop,
  stopAllVoice,
} from "@/lib/ariaVoiceController";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
const FADE_SEC = 0.025;

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentGain: GainNode | null = null;

const inflight = new Map<string, Promise<Blob>>();
const blobCache = new Map<string, Blob>();
const decodeCache = new Map<string, AudioBuffer>();

function ttsBody(text: string): Record<string, string> {
  const body: Record<string, string> = { text };
  if (process.env.NEXT_PUBLIC_TTS_VOICE) body.voice = process.env.NEXT_PUBLIC_TTS_VOICE;
  if (process.env.NEXT_PUBLIC_TTS_RATE) body.rate = process.env.NEXT_PUBLIC_TTS_RATE;
  if (process.env.NEXT_PUBLIC_TTS_PITCH) body.pitch = process.env.NEXT_PUBLIC_TTS_PITCH;
  return body;
}

function cacheKey(text: string): string {
  return text;
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
  if (currentSource !== null) return true;
  if (typeof window !== "undefined" && window.speechSynthesis?.speaking) return true;
  return false;
}

function fadeOutAndStop(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
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
  const ctx = getAudioContext();
  if (ctx) void ctx.resume();
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.resume();
    void window.speechSynthesis.getVoices();
  } catch {
    /* ignore */
  }
}

export async function fetchTtsBlob(text: string): Promise<Blob> {
  const clean = stripTags(text).trim();
  if (!clean) throw new Error("empty text");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

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
  await getTtsBlob(text);
}

export interface SpeakTtsOptions {
  onPlaying?: () => void;
  audioRef?: { current: HTMLAudioElement | null };
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

    const safety = window.setTimeout(finish, Math.ceil(dur * 1000) + 1500);
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

/** Chrome GCs utterances that are not held on a global — that kills audio with no error. */
let heldUtterance: SpeechSynthesisUtterance | null = null;
let pinnedVoice: SpeechSynthesisVoice | null = null;

function pinBrowserVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  if (pinnedVoice && window.speechSynthesis.getVoices().includes(pinnedVoice)) return pinnedVoice;
  const voices = window.speechSynthesis.getVoices();
  const scored = voices
    .filter((v) => /^en(-|$)/i.test(v.lang))
    .map((v) => {
      const n = v.name;
      let score = 0;
      if (/Aria/i.test(n)) score += 50;
      if (/Samantha|Jenny|Google US English|Microsoft Aria|Female/i.test(n)) score += 20;
      if (/en-US/i.test(v.lang)) score += 10;
      return { v, score };
    })
    .sort((a, b) => b.score - a.score);
  pinnedVoice = scored[0]?.v ?? null;
  return pinnedVoice;
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    pinBrowserVoice();
  });
}

function speakBrowser(text: string, gen: number, options?: SpeakTtsOptions): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return Promise.reject(new Error("No speechSynthesis"));
  }
  if (gen !== currentVoiceGeneration()) return Promise.resolve();

  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();
  const utter = new SpeechSynthesisUtterance(text);
  heldUtterance = utter;
  utter.rate = 1.04;
  utter.pitch = 1.02;
  utter.lang = "en-US";
  const voice = pinBrowserVoice();
  if (voice) utter.voice = voice;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (heldUtterance === utter) heldUtterance = null;
      resolve();
    };
    utter.onend = finish;
    utter.onerror = finish;
    options?.onPlaying?.();
    window.speechSynthesis.speak(utter);
    window.setTimeout(finish, Math.min(25000, 800 + text.length * 90));
  });
}

export async function speakTts(text: string, options?: SpeakTtsOptions): Promise<void> {
  const clean = stripTags(text).trim();
  if (!clean) return;

  fadeOutAndStop();
  const gen = nextVoiceGeneration();
  void getAudioContext()?.resume();
  if (typeof window !== "undefined") {
    try {
      window.speechSynthesis?.resume();
    } catch {
      /* ignore */
    }
  }

  const localStop = () => {
    fadeOutAndStop();
    heldUtterance = null;
    if (options?.audioRef) options.audioRef.current = null;
  };
  registerVoiceStop(localStop);

  try {
    const cached = blobCache.get(cacheKey(clean));
    if (cached) {
      const buffer = await decodeBlob(clean, cached);
      if (gen !== currentVoiceGeneration()) return;
      await getAudioContext()?.resume();
      await playBuffer(buffer, gen, options);
      return;
    }

    // Unique LLM lines must speak now — Edge often takes >10s or 429s. Cache the clip in the background.
    void getTtsBlob(clean).catch(() => {});
    await speakBrowser(clean, gen, options);
  } catch (err) {
    console.warn("[tts] playback failed:", err);
    if (gen === currentVoiceGeneration()) {
      try {
        await speakBrowser(clean, gen, options);
      } catch {
        /* ignore */
      }
    }
  } finally {
    unregisterVoiceStop(localStop);
    if (options?.audioRef) options.audioRef.current = null;
  }
}

export interface SpeakTtsSequenceOptions extends SpeakTtsOptions {
  onChunkStart?: (index: number, text: string) => void;
}

export async function speakTtsSequence(
  lines: string[],
  options?: SpeakTtsSequenceOptions
): Promise<void> {
  const chunks = lines.map((l) => stripTags(l).trim()).filter(Boolean);
  if (!chunks.length) return;
  await speakTts(chunks.join(" "), options);
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

export function resetVoiceQueue(): void {
  voiceQueue = Promise.resolve();
}
