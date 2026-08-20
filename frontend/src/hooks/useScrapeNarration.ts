"use client";

import { useEffect, useRef } from "react";
import { buildScrapeNarrationLines } from "@/lib/scrapeNarration";
import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import type { PatientProfile } from "@/lib/types";
import { stopAllVoice } from "@/lib/ariaVoiceController";
import { speakTtsQueued, prefetchTtsLines } from "@/lib/ttsSpeak";

const LINE_TIMEOUT_MS = 12000;
const REPLAY_WAIT_MAX_MS = 60000;

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function speakLineWithTimeout(line: string): Promise<void> {
  await Promise.race([
    speakTtsQueued(line),
    waitMs(LINE_TIMEOUT_MS).then(() => undefined),
  ]);
}

export interface UseScrapeNarrationOptions {
  active: boolean;
  profile: PatientProfile;
  summary: ScrapeExecutiveSummary | null;
  replayComplete: boolean;
  onCaption?: (line: string) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onFinished: () => void;
}

export function useScrapeNarration({
  active,
  profile,
  summary,
  replayComplete,
  onCaption,
  onSpeakingChange,
  onFinished,
}: UseScrapeNarrationOptions) {
  const startedRef = useRef(false);
  const replayCompleteRef = useRef(replayComplete);
  const onFinishedRef = useRef(onFinished);
  const onCaptionRef = useRef(onCaption);
  const onSpeakingRef = useRef(onSpeakingChange);
  const profileRef = useRef(profile);
  const summaryRef = useRef(summary);

  replayCompleteRef.current = replayComplete;
  onFinishedRef.current = onFinished;
  onCaptionRef.current = onCaption;
  onSpeakingRef.current = onSpeakingChange;
  profileRef.current = profile;
  summaryRef.current = summary;

  useEffect(() => {
    if (!active) return;
    if (startedRef.current) return;
    startedRef.current = true;

    const signal = { cancelled: false };
    const { intro, afterReplay } = buildScrapeNarrationLines(
      profileRef.current,
      summaryRef.current
    );
    prefetchTtsLines([...intro, ...afterReplay]);

    const finish = () => {
      if (!signal.cancelled) onFinishedRef.current();
    };

    const run = async () => {
      stopAllVoice();
      onSpeakingRef.current?.(true);

      try {
        for (const line of intro) {
          if (signal.cancelled) break;
          onCaptionRef.current?.(line);
          await speakLineWithTimeout(line);
        }

        const waitStart = Date.now();
        while (
          !signal.cancelled &&
          !replayCompleteRef.current &&
          Date.now() - waitStart < REPLAY_WAIT_MAX_MS
        ) {
          await waitMs(250);
        }

        for (const line of afterReplay) {
          if (signal.cancelled) break;
          onCaptionRef.current?.(line);
          await speakLineWithTimeout(line);
        }
      } finally {
        onSpeakingRef.current?.(false);
        onCaptionRef.current?.("");
        finish();
      }
    };

    void run();

    return () => {
      signal.cancelled = true;
    };
  }, [active]);
}
