"use client";

/** @deprecated Use useScrapeTimeline — thin wrapper for backward compatibility */
import type { ScraperLog } from "@/lib/types";
import { useScrapeTimeline } from "./useScrapeTimeline";

export interface ScrapeReplayOptions {
  events: ScraperLog[];
  speedMultiplier?: number;
  active: boolean;
  onComplete?: () => void;
  onHealEvent?: (log: ScraperLog) => void;
}

export function useScrapeReplay({
  events,
  speedMultiplier = 8,
  active,
  onComplete,
  onHealEvent,
}: ScrapeReplayOptions) {
  const state = useScrapeTimeline({
    mode: "replay",
    active,
    events,
    speedMultiplier,
    onTimelineComplete: onComplete,
    onHealEvent,
  });
  return {
    ...state,
    isReplay: true,
  };
}

export { CX, CY } from "./useScrapeTimeline";
