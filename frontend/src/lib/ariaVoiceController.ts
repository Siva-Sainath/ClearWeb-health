/**
 * Global voice session — ensures only one TTS stream plays at a time
 * and allows hard-stop when journey phase changes.
 */

let generation = 0;
let activeStop: (() => void) | null = null;

export function nextVoiceGeneration(): number {
  generation += 1;
  return generation;
}

export function currentVoiceGeneration(): number {
  return generation;
}

export function registerVoiceStop(stop: () => void): void {
  activeStop?.();
  activeStop = stop;
}

export function unregisterVoiceStop(stop: () => void): void {
  if (activeStop === stop) activeStop = null;
}

/** Stop any in-flight TTS (phase transitions, unmount, new utterance). */
export function stopAllVoice(): void {
  generation += 1;
  activeStop?.();
  activeStop = null;
  if (typeof window !== "undefined") {
    // Do not call speechSynthesis.cancel() — Chrome emits a click even when unused.
  }
}
