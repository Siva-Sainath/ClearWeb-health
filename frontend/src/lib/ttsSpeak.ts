/**
 * Shared Edge TTS playback — single flight, prefetch, play only when audio is ready.
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

let onboardingWelcomeInFlight: Promise<void> | null = null;

const inflight = new Map<string, Promise<Blob>>();
const blobCache = new Map<string, Blob>();

function ttsBody(text: string): Record<string, string> {
  const body: Record<string, string> = { text };
  if (process.env.NEXT_PUBLIC_TTS_VOICE) body.voice = process.env.NEXT_PUBLIC_TTS_VOICE;
  if (process.env.NEXT_PUBLIC_TTS_RATE) body.rate = process.env.NEXT_PUBLIC_TTS_RATE;
  else body.rate = "+0%";
  if (process.env.NEXT_PUBLIC_TTS_PITCH) body.pitch = process.env.NEXT_PUBLIC_TTS_PITCH;
  else body.pitch = "+0Hz";
  return body;
}

function cacheKey(text: string): string {
  return text.slice(0, 200);
}

export async function fetchTtsBlob(text: string): Promise<Blob> {
  const clean = stripTags(text).trim();
  if (!clean) throw new Error("empty text");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`${BACKEND}/api/tts/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ttsBody(clean)),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("TTS unavailable");
    return res.blob();
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

/** Warm TTS cache before first speak (cuts onboarding lag). */
export function prefetchTts(text: string): void {
  const clean = stripTags(text).trim();
  if (!clean) return;
  void getTtsBlob(clean).catch(() => {});
}

export function prefetchTtsLines(lines: string[]): void {
  lines.forEach((line) => prefetchTts(line));
}

/** Wait until TTS audio is fetched (uses prefetch cache when present). */
export async function ensureTtsReady(text: string): Promise<void> {
  await getTtsBlob(text);
}

function speakFallback(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.02;
    utt.onend = () => resolve();
    utt.onerror = () => resolve();
    window.speechSynthesis.speak(utt);
  });
}

export interface SpeakTtsOptions {
  onPlaying?: () => void;
  audioRef?: { current: HTMLAudioElement | null };
}

function playBlob(
  blob: Blob,
  gen: number,
  options?: SpeakTtsOptions
): Promise<void> {
  const url = URL.createObjectURL(blob);
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = url;
  if (options?.audioRef) options.audioRef.current = audio;

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => URL.revokeObjectURL(url);
    let started = false;
    const safetyTimer = setTimeout(() => {
      audio.pause();
      cleanup();
      resolve();
    }, 45000);

    const done = () => {
      clearTimeout(safetyTimer);
      cleanup();
      resolve();
    };

    const startPlay = () => {
      if (started) return;
      started = true;
      if (gen !== currentVoiceGeneration()) {
        clearTimeout(safetyTimer);
        cleanup();
        audio.pause();
        resolve();
        return;
      }
      audio.play().catch(reject);
    };

    audio.onplaying = () => {
      options?.onPlaying?.();
    };
    audio.onended = () => {
      done();
    };
    audio.onerror = () => {
      clearTimeout(safetyTimer);
      cleanup();
      reject(new Error("Audio playback failed"));
    };

    if (audio.readyState >= 2) {
      startPlay();
    } else {
      audio.addEventListener("canplay", startPlay, { once: true });
      audio.load();
    }
  });
}

export async function speakTts(text: string, options?: SpeakTtsOptions): Promise<void> {
  const clean = stripTags(text).trim();
  if (!clean) return;

  stopAllVoice();
  const gen = nextVoiceGeneration();

  const localStop = () => {
    if (options?.audioRef?.current) {
      options.audioRef.current.pause();
      options.audioRef.current = null;
    }
  };
  registerVoiceStop(localStop);

  try {
    const blob = await getTtsBlob(clean);
    if (gen !== currentVoiceGeneration()) return;
    await playBlob(blob, gen, options);
  } catch {
    if (gen === currentVoiceGeneration()) {
      await speakFallback(clean);
    }
  } finally {
    unregisterVoiceStop(localStop);
    if (options?.audioRef) options.audioRef.current = null;
  }
}

export interface SpeakTtsSequenceOptions extends SpeakTtsOptions {
  onChunkStart?: (index: number, text: string) => void;
}

/** Pre-rendered welcome clips (Microsoft Aria neural) — avoids live TTS glitches on short phrases. */
export const ONBOARDING_WELCOME_CLIPS: { url: string; caption: string }[] = [
  { url: "/audio/aria-hi.mp3", caption: "Hi, I'm Aria." },
  {
    url: "/audio/aria-question.mp3",
    caption: "What are you trying to get priced — an ER visit, MRI, or colonoscopy?",
  },
];

function playAudioUrl(url: string, gen: number, options?: SpeakTtsOptions): Promise<void> {
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.volume = 1;
  if (options?.audioRef) options.audioRef.current = audio;

  return new Promise<void>((resolve, reject) => {
    let started = false;

    const startPlay = () => {
      if (started) return;
      started = true;
      if (gen !== currentVoiceGeneration()) {
        audio.pause();
        resolve();
        return;
      }
      audio.play().catch(reject);
    };

    audio.onplaying = () => {
      options?.onPlaying?.();
    };
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error(`Audio failed: ${url}`));

    if (audio.readyState >= 2) {
      startPlay();
    } else {
      audio.addEventListener("loadeddata", startPlay, { once: true });
      audio.load();
    }
  });
}

/** Warm browser cache for bundled welcome audio. */
export function prefetchWelcomeAudio(): void {
  if (typeof window === "undefined") return;
  for (const clip of ONBOARDING_WELCOME_CLIPS) {
    const a = new Audio(clip.url);
    a.preload = "auto";
    a.load();
  }
}

/** Onboarding opener — static MP3 clips (crisp intro); live TTS only if clips fail. */
export async function speakOnboardingWelcome(
  options?: SpeakTtsSequenceOptions
): Promise<void> {
  if (onboardingWelcomeInFlight) {
    await onboardingWelcomeInFlight;
    return;
  }

  const work = async () => {
    stopAllVoice();
    const gen = nextVoiceGeneration();

    const localStop = () => {
      if (options?.audioRef?.current) {
        options.audioRef.current.pause();
        options.audioRef.current = null;
      }
    };
    registerVoiceStop(localStop);

    try {
      for (let i = 0; i < ONBOARDING_WELCOME_CLIPS.length; i++) {
        const clip = ONBOARDING_WELCOME_CLIPS[i];
        if (gen !== currentVoiceGeneration()) return;

        options?.onChunkStart?.(i, clip.caption);
        await playAudioUrl(clip.url, gen, {
          audioRef: options?.audioRef,
          onPlaying: i === 0 ? options?.onPlaying : undefined,
        });
      }
    } catch {
      if (gen === currentVoiceGeneration()) {
        const { getOnboardingWelcomeChunks } = await import("@/lib/voiceCopy");
        await speakTtsSequence(getOnboardingWelcomeChunks().slice(1), options);
      }
    } finally {
      unregisterVoiceStop(localStop);
      if (options?.audioRef) options.audioRef.current = null;
    }
  };

  onboardingWelcomeInFlight = work();
  try {
    await onboardingWelcomeInFlight;
  } finally {
    onboardingWelcomeInFlight = null;
  }
}

/** Play short lines in one voice session — smoother than one long TTS blob. */
export async function speakTtsSequence(
  lines: string[],
  options?: SpeakTtsSequenceOptions
): Promise<void> {
  const chunks = lines.map((l) => stripTags(l).trim()).filter(Boolean);
  if (!chunks.length) return;

  stopAllVoice();
  const gen = nextVoiceGeneration();

  const localStop = () => {
    if (options?.audioRef?.current) {
      options.audioRef.current.pause();
      options.audioRef.current = null;
    }
  };
  registerVoiceStop(localStop);

  try {
    for (let i = 0; i < chunks.length; i++) {
      const clean = chunks[i];
      if (gen !== currentVoiceGeneration()) return;

      options?.onChunkStart?.(i, clean);
      const blob = await getTtsBlob(clean);
      if (gen !== currentVoiceGeneration()) return;

      await playBlob(blob, gen, {
        audioRef: options?.audioRef,
        onPlaying: i === 0 ? options?.onPlaying : undefined,
      });
    }
  } catch {
    if (gen === currentVoiceGeneration()) {
      await speakFallback(chunks.join(" "));
    }
  } finally {
    unregisterVoiceStop(localStop);
    if (options?.audioRef) options.audioRef.current = null;
  }
}

export function stopTtsPlayback(): void {
  stopAllVoice();
}

/** Serialize TTS so overlapping callers never double-speak. */
let voiceQueue: Promise<void> = Promise.resolve();

export function speakTtsQueued(text: string, options?: SpeakTtsOptions): Promise<void> {
  const run = () => speakTts(text, options);
  voiceQueue = voiceQueue.then(run, run);
  return voiceQueue;
}

export function resetVoiceQueue(): void {
  voiceQueue = Promise.resolve();
}
