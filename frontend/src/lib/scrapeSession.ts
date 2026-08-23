import type { PatientProfile, FacilityResult, ScraperLog } from "@/lib/types";
import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import type { LlmExplanation } from "@/lib/llmExplanation";

export interface ScrapeContextPayload {
  dataSource: string;
  honestyLine: string;
  methodSummary: string;
  stats: {
    collectorsVisited: number;
    cacheHits: number;
    liveDownloads: number;
    healTriggered: number;
    healSuccess: number;
    pricesExtracted: number;
    extractionFailures: number;
  };
  healEvents: Array<{
    timestamp?: string;
    collector_id?: string;
    reason?: string;
    success?: boolean;
  }>;
  replayTimeline: Array<{
    ts?: string;
    phase: string;
    label: string;
    cacheHit?: boolean;
    nodeId?: string;
    success?: boolean | null;
  }>;
  replayEventCount: number;
}

export interface BrainSessionResponse {
  sessionId: string;
  jobId?: string;
  status: "running" | "complete";
  presentationMode: "live" | "proof-reel" | "instant" | "replay";
  profile: PatientProfile;
  results?: Record<string, FacilityResult>;
  events?: ScraperLog[];
  replayEvents?: ScraperLog[];
  healEvents?: Array<{ collector_id?: string; reason?: string; success?: boolean; timestamp?: string }>;
  lastUpdated?: string;
  scrapeContext?: ScrapeContextPayload;
  executiveSummary?: ScrapeExecutiveSummary | null;
  explanation?: LlmExplanation | null;
  explanationSource?: "deterministic" | "conductor";
  presentation?: {
    spokenScript?: string;
    steps?: Array<{ tool?: string; args?: Record<string, unknown>; delayMs?: number; caption?: string; actions?: unknown[] }>;
    actions?: unknown[];
    uiActions?: string[];
    source?: string;
  } | null;
  eventsUrl?: string;
  resultsUrl?: string;
  eventCount?: number;
  error?: string;
}

export function normalizeBrainSession(raw: unknown): BrainSessionResponse | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as BrainSessionResponse;
}
