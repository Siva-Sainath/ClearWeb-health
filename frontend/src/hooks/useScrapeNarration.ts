"use client";

import { useEffect, useRef } from "react";
import {
  allPhaseLines,
  buildScrapeNarrationLines,
  healNarrationLine,
  type ScrapePhaseLine,
} from "@/lib/scrapeNarration";
import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import type { PatientProfile, ScraperLog } from "@/lib/types";
import { stopAllVoice } from "@/lib/ariaVoiceController";
import { speakScriptedQueued, prefetchTtsLines } from "@/lib/ttsSpeak";

const LINE_TIMEOUT_MS = 25000;

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function speakLineWithTimeout(line: string): Promise<void> {
  await Promise.race([
    speakScriptedQueued(line),
    waitMs(LINE_TIMEOUT_MS).then(() => undefined),
  ]);
}

export interface UseScrapeNarrationOptions {
  active: boolean;
  profile: PatientProfile;
  summary: ScrapeExecutiveSummary | null;
  /** Replay: wait for animation. Live: wait for job complete. */
  scrapeComplete: boolean;
  isLive?: boolean;
  onCaption?: (line: string) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  onFinished: () => void;
  /** Heal line from timeline — spoken once, ahead of pipeline phases. */
  pendingHealLine?: string | null;
  onHealLineSpoken?: () => void;
  /** Pipeline phase line — deduped by phase key. */
  pendingPhaseLine?: ScrapePhaseLine | null;
  onPhaseLineSpoken?: () => void;
}

interface QueuedLine {
  key: string;
  line: string;
}

export function useScrapeNarration({
  active,
  profile,
  summary,
  scrapeComplete,
  isLive = false,
  onCaption,
  onSpeakingChange,
  onFinished,
  pendingHealLine,
  onHealLineSpoken,
  pendingPhaseLine,
  onPhaseLineSpoken,
}: UseScrapeNarrationOptions) {
  const runIdRef = useRef(0);
  const onFinishedRef = useRef(onFinished);
  const onCaptionRef = useRef(onCaption);
  const onSpeakingRef = useRef(onSpeakingChange);
  const profileRef = useRef(profile);
  const summaryRef = useRef(summary);
  const scrapeCompleteRef = useRef(scrapeComplete);
  const isLiveRef = useRef(isLive);
  const onHealSpokenRef = useRef(onHealLineSpoken);
  const onPhaseSpokenRef = useRef(onPhaseLineSpoken);

  /** Single serialized queue so intro, heal, and phase lines never overlap. */
  const queueRef = useRef<QueuedLine[]>([]);
  const spokenKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    scrapeCompleteRef.current = scrapeComplete;
    isLiveRef.current = isLive;
    onFinishedRef.current = onFinished;
    onCaptionRef.current = onCaption;
    onSpeakingRef.current = onSpeakingChange;
    profileRef.current = profile;
    summaryRef.current = summary;
    onHealSpokenRef.current = onHealLineSpoken;
    onPhaseSpokenRef.current = onPhaseLineSpoken;
  }, [
    scrapeComplete,
    isLive,
    onFinished,
    onCaption,
    onSpeakingChange,
    profile,
    summary,
    onHealLineSpoken,
    onPhaseLineSpoken,
  ]);

  useEffect(() => {
    if (!active) return;

    const runId = ++runIdRef.current;
    const signal = { cancelled: false };
    queueRef.current = [];
    spokenKeysRef.current = new Set();

    const { intro, afterReplay } = buildScrapeNarrationLines(
      profileRef.current,
      summaryRef.current,
      { isLive: isLiveRef.current }
    );
    const procedure =
      summaryRef.current?.procedure?.trim() ||
      profileRef.current.procedure ||
      profileRef.current.condition ||
      undefined;
    prefetchTtsLines([
      ...intro,
      ...allPhaseLines({ procedure, isLive: isLiveRef.current }),
      ...afterReplay,
    ]);

    const live = () => !signal.cancelled && runId === runIdRef.current;

    const speak = async (line: string) => {
      if (!live()) return;
      onCaptionRef.current?.(line);
      await speakLineWithTimeout(line);
    };

    const run = async () => {
      stopAllVoice();
      onSpeakingRef.current?.(true);

      try {
        for (const line of intro) {
          if (!live()) break;
          await speak(line);
        }

        // Drain pipeline/heal lines while the reel plays.
        while (live() && !scrapeCompleteRef.current) {
          const next = queueRef.current.shift();
          if (!next) {
            await waitMs(200);
            continue;
          }
          await speak(next.line);
        }

        // Anything captured right at the end (e.g. a late heal) still gets said.
        const tail = queueRef.current.shift();
        if (tail) await speak(tail.line);
        queueRef.current = [];

        // Re-read the summary — it usually lands while the reel is playing.
        const { afterReplay: closing } = buildScrapeNarrationLines(
          profileRef.current,
          summaryRef.current,
          { isLive: isLiveRef.current }
        );
        for (const line of closing) {
          if (!live()) break;
          await speak(line);
        }
      } finally {
        onSpeakingRef.current?.(false);
        onCaptionRef.current?.("");
        if (live()) onFinishedRef.current();
      }
    };

    void run();

    return () => {
      signal.cancelled = true;
    };
  }, [active]);

  // Heal is the money moment — queue it first, only once.
  useEffect(() => {
    if (!active || !pendingHealLine) return;
    if (!spokenKeysRef.current.has("heal")) {
      spokenKeysRef.current.add("heal");
      queueRef.current.unshift({ key: "heal", line: pendingHealLine });
    }
    onHealSpokenRef.current?.();
  }, [active, pendingHealLine]);

  useEffect(() => {
    if (!active || !pendingPhaseLine) return;
    const { key, line } = pendingPhaseLine;
    if (!spokenKeysRef.current.has(key)) {
      spokenKeysRef.current.add(key);
      queueRef.current.push({ key, line });
    }
    onPhaseSpokenRef.current?.();
  }, [active, pendingPhaseLine]);
}

/** Build heal caption from scrape log */
export function healLineFromLog(log: ScraperLog, isLive = false): string {
  return healNarrationLine(log.collector_id, log.detail, log.event, log.facility_name, {
    isLive,
  });
}
