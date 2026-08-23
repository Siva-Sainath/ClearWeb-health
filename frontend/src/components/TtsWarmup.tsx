"use client";

import { useEffect } from "react";
import { warmAriaVoice } from "@/lib/ttsSpeak";

/** Prefetch Edge TTS clips on first paint so every line uses the same voice. */
export default function TtsWarmup() {
  useEffect(() => {
    void warmAriaVoice();
  }, []);
  return null;
}
