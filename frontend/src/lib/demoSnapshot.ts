/**
 * Pre-collected Austin hospital demo — real MRF scrape output for instant results phase.
 */

import type { PatientProfile, FacilityResult, ScraperLog } from "@/lib/types";
import snapshot from "@/data/austinDemoSnapshot.json";

export interface DemoSnapshot {
  profile: PatientProfile;
  results: Record<string, FacilityResult>;
  events: ScraperLog[];
  /** Full narrative replay including failures, heals, and successes */
  replayEvents?: ScraperLog[];
}

export const AUSTIN_DEMO_SNAPSHOT = snapshot as unknown as DemoSnapshot;

export function getDemoReplayEvents(profile?: PatientProfile): ScraperLog[] {
  const raw =
    AUSTIN_DEMO_SNAPSHOT.replayEvents?.length
      ? AUSTIN_DEMO_SNAPSHOT.replayEvents
      : AUSTIN_DEMO_SNAPSHOT.events;
  return profile ? applyProfileToDemoEvents(profile, raw) : raw;
}

/** Merge user onboarding profile onto snapshot facilities (procedure, insurance, network). */
export function applyProfileToDemoResults(
  profile: PatientProfile,
  results: Record<string, FacilityResult>
): Record<string, FacilityResult> {
  const proc = profile.procedure || profile.condition || "your procedure";
  const cpt = profile.cptCode || "";
  const network = profile.insurance || "";
  const out: Record<string, FacilityResult> = {};
  for (const [id, f] of Object.entries(results)) {
    out[id] = {
      ...f,
      procedure: proc,
      cpt_code: cpt || f.cpt_code,
      network: network || f.network,
    };
  }
  return out;
}

export function applyProfileToDemoEvents(
  profile: PatientProfile,
  events: ScraperLog[]
): ScraperLog[] {
  const cpt = profile.cptCode || "";
  const network = profile.insurance || "";
  return events.map((e) => ({
    ...e,
    cpt_code: cpt || e.cpt_code,
    network: network || e.network,
  }));
}
