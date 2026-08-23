"use client";

import { useEffect, useRef, useCallback } from "react";
import type { ScrapeStatus } from "@/lib/types";

export interface UseScrapeOrchestratorOptions {
  active: boolean;
  /** Results loaded — always true for proof-reel; live when scrape job complete */
  jobDataReady: boolean;
  timelineComplete: boolean;
  narrationComplete: boolean;
  scrapeStatus: ScrapeStatus;
  minDurationMs?: number;
  onAdvanceToResults: () => void;
}

/**
 * Single gate for transitioning scraping → results.
 */
export function useScrapeOrchestrator({
  active,
  jobDataReady,
  timelineComplete,
  narrationComplete,
  scrapeStatus,
  minDurationMs = 0,
  onAdvanceToResults,
}: UseScrapeOrchestratorOptions) {
  const startedAtRef = useRef<number | null>(null);
  const advancedRef = useRef(false);
  const onAdvanceRef = useRef(onAdvanceToResults);

  useEffect(() => {
    onAdvanceRef.current = onAdvanceToResults;
  }, [onAdvanceToResults]);

  useEffect(() => {
    if (!active) {
      startedAtRef.current = null;
      advancedRef.current = false;
      return;
    }
    if (!startedAtRef.current) {
      startedAtRef.current = Date.now();
      advancedRef.current = false;
    }
  }, [active]);

  const tryAdvance = useCallback(() => {
    if (advancedRef.current) return;
    if (!active) return;

    const elapsed = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    const minMet = elapsed >= minDurationMs;

    if (scrapeStatus === "failed" || scrapeStatus === "cancelled") return;

    const ready = jobDataReady && timelineComplete && narrationComplete && minMet;

    if (ready) {
      advancedRef.current = true;
      onAdvanceRef.current();
    }
  }, [active, jobDataReady, timelineComplete, narrationComplete, scrapeStatus, minDurationMs]);

  useEffect(() => {
    tryAdvance();
  }, [tryAdvance]);

  const forceAdvance = useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onAdvanceRef.current();
  }, []);

  return { forceAdvance };
}
