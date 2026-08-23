"use client";

/** @deprecated Use useScrapeTimeline — thin wrapper for backward compatibility */
import { useScrapeTimeline } from "./useScrapeTimeline";

export { CX, CY, INITIAL_NODES, HOSPITAL_NODE_COUNT } from "./useScrapeTimeline";

export function useScrapeStream(
  jobId: string | null,
  options?: { active?: boolean; onHealEvent?: (log: import("@/lib/types").ScraperLog) => void }
) {
  const active = options?.active ?? !!jobId;
  const state = useScrapeTimeline({
    mode: "live",
    active,
    jobId,
    onHealEvent: options?.onHealEvent,
  });
  return {
    nodes: state.nodes,
    logs: state.logs,
    activeNode: state.activeNode,
    healingNode: state.healingNode,
    completedCount: state.completedCount,
    totalNodes: state.totalNodes,
    cacheHits: state.cacheHits,
    liveDownloads: state.liveDownloads,
    failureCount: state.failureCount,
    healCount: state.healCount,
    elapsedSec: state.elapsedSec,
    isLiveScraping: state.isLiveScraping,
    isCacheOnly: state.isCacheOnly,
    timelineComplete: state.timelineComplete,
    mitigationLabel: state.mitigationLabel,
  };
}
