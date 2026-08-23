"use client";

import { useEffect, useRef } from "react";
import { buildScrapeNarrationLines, healNarrationLine } from "@/lib/scrapeNarration";
import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import type { PatientProfile, ScraperLog } from "@/lib/types";
import { stopAllVoice } from "@/lib/ariaVoiceController";
import { speakTtsQueued, prefetchTtsLines } from "@/lib/ttsSpeak";

const LINE_TIMEOUT_MS = 12000;

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
  /** Replay: wait for animation. Live: wait for job complete. */
  scrapeComplete: boolean;
  onCaption?: (line: string) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onFinished: () => void;
  /** Heal events from timeline (live or replay). */
  pendingHealLine?: string | null;
  onHealLineSpoken?: () => void;
  pendingProcessLine?: string | null;
  onProcessLineSpoken?: () => void;
}

export function useScrapeNarration({
  active,
  profile,
  summary,
  scrapeComplete,
  onCaption,
  onSpeakingChange,
  onFinished,
  pendingHealLine,
  onHealLineSpoken,
  pendingProcessLine,
  onProcessLineSpoken,
}: UseScrapeNarrationOptions) {
  const runIdRef = useRef(0);
  const onFinishedRef = useRef(onFinished);
  const onCaptionRef = useRef(onCaption);
  const onSpeakingRef = useRef(onSpeakingChange);
  const profileRef = useRef(profile);
  const summaryRef = useRef(summary);
  const scrapeCompleteRef = useRef(scrapeComplete);
  const onHealSpokenRef = useRef(onHealLineSpoken);
  const onProcessSpokenRef = useRef(onProcessLineSpoken);

  useEffect(() => {
    scrapeCompleteRef.current = scrapeComplete;
    onFinishedRef.current = onFinished;
    onCaptionRef.current = onCaption;
    onSpeakingRef.current = onSpeakingChange;
    profileRef.current = profile;
    summaryRef.current = summary;
    onHealSpokenRef.current = onHealLineSpoken;
    onProcessSpokenRef.current = onProcessLineSpoken;
  }, [scrapeComplete, onFinished, onCaption, onSpeakingChange, profile, summary, onHealLineSpoken, onProcessLineSpoken]);

  // Main narration sequence
  useEffect(() => {
    if (!active) return;

    const runId = ++runIdRef.current;
    const signal = { cancelled: false };
    const { intro, afterReplay } = buildScrapeNarrationLines(
      profileRef.current,
      summaryRef.current
    );
    prefetchTtsLines([...intro, ...afterReplay]);

    const finish = () => {
      if (!signal.cancelled && runId === runIdRef.current) onFinishedRef.current();
    };

    const run = async () => {
      stopAllVoice();
      onSpeakingRef.current?.(true);

      try {
        for (const line of intro) {
          if (signal.cancelled || runId !== runIdRef.current) break;
          onCaptionRef.current?.(line);
          await speakLineWithTimeout(line);
        }

        while (
          !signal.cancelled &&
          runId === runIdRef.current &&
          !scrapeCompleteRef.current
        ) {
          await waitMs(250);
        }

        for (const line of afterReplay) {
          if (signal.cancelled || runId !== runIdRef.current) break;
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

  // Event-driven heal narration (interrupt queue with one line)
  useEffect(() => {
    if (!active || !pendingHealLine) return;
    const line = pendingHealLine;
    void (async () => {
      onCaptionRef.current?.(line);
      onSpeakingRef.current?.(true);
      await speakLineWithTimeout(line);
      onSpeakingRef.current?.(false);
      onHealSpokenRef.current?.();
    })();
  }, [active, pendingHealLine]);

  useEffect(() => {
    if (!active || !pendingProcessLine || pendingHealLine) return;
    const line = pendingProcessLine;
    void (async () => {
      onCaptionRef.current?.(line);
      onSpeakingRef.current?.(true);
      await speakLineWithTimeout(line);
      onSpeakingRef.current?.(false);
      onProcessSpokenRef.current?.();
    })();
  }, [active, pendingProcessLine, pendingHealLine]);
}

/** Build heal caption from scrape log */
export function healLineFromLog(log: ScraperLog): string {
  return healNarrationLine(log.collector_id, log.detail, log.event);
}
