/**
 * St Luke's self-heal showcase — real recorded Bright Data heal cycle.
 */

import type { ScraperLog } from "@/lib/types";
import showcase from "@/data/stlukesHealShowcase.json";
import texasSnapshot from "@/data/texasCollectorSnapshot.json";

export interface HealLogStep {
  ts: string;
  step: string;
  message: string;
  success?: boolean;
}

export interface HealShowcaseData {
  capturedAt: string;
  collectorId: string;
  facility: {
    name: string;
    slug: string;
    domain: string;
    city: string;
    region: string;
    targetUrl: string;
  };
  replayEvents: ScraperLog[];
  healEvents: Array<{
    timestamp: string;
    collector_id: string;
    reason: string;
    success: boolean;
  }>;
  healLog: HealLogStep[];
}

export interface TexasCollectorSnapshot {
  verified: number;
  pending: number;
  failed: number;
  byStatus?: Record<string, number>;
  recent?: Array<{
    slug: string;
    hospitalName: string;
    collectorId: string;
    status: string;
    reason?: string | null;
    targetUrl?: string;
  }>;
  healEvents?: Array<{
    timestamp: string;
    collector_id: string;
    reason: string;
    success: boolean;
  }>;
  healSuccessCount?: number;
  asOf?: string;
}

export const ST_LUKES_HEAL_SHOWCASE = showcase as unknown as HealShowcaseData;
export const TEXAS_COLLECTOR_SNAPSHOT = texasSnapshot as unknown as TexasCollectorSnapshot;

/** Single-node layout for Houston St Luke's showcase replay */
export const SHOWCASE_ST_LUKES_NODE = {
  id: "web_stlukes",
  domain: "stlukeshealth.org",
  label: "St. Luke's Baylor Houston",
  shortLabel: "St. Luke's",
  x: 450,
  y: 280,
  status: "idle" as const,
};

export function resolveShowcaseNodeId(): string {
  return "web_stlukes";
}
