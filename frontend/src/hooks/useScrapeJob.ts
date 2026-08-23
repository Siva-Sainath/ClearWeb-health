"use client";

import { useCallback, useRef } from "react";
import { useAppContext } from "@/context/AppContext";
import { stopAllVoice } from "@/lib/ariaVoiceController";
import { resetVoiceQueue } from "@/lib/ttsSpeak";
import { buildScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import { buildDeterministicExplanation } from "@/lib/deterministicExplanation";
import {
  AUSTIN_DEMO_SNAPSHOT,
  applyProfileToDemoEvents,
  applyProfileToDemoResults,
  getDemoReplayEvents,
} from "@/lib/demoSnapshot";
import type { PatientProfile, ScraperLog } from "@/lib/types";
import { checkZipCache } from "@/lib/zipCacheCheck";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
const USE_LLM_EXPLANATION = process.env.NEXT_PUBLIC_USE_LLM_EXPLANATION === "true";
const AGENTIC_RESULTS = process.env.NEXT_PUBLIC_AGENTIC_RESULTS === "true";
const USE_LLM_EXPLANATION_EFFECTIVE = USE_LLM_EXPLANATION || AGENTIC_RESULTS;
const HACKATHON_DEMO_MODE = process.env.NEXT_PUBLIC_HACKATHON_DEMO_MODE === "true";
const SKIP_SCRAPE_ANIMATION = process.env.NEXT_PUBLIC_SKIP_SCRAPE_ANIMATION === "true";

type HealEventSummary = {
  collector_id?: string;
  reason?: string;
  success?: boolean;
  timestamp?: string;
};

function healEventsFromLogs(events: ScraperLog[]): HealEventSummary[] {
  const succeeded = new Set(
    events
      .filter((e) => e.event === "price_extracted" && e.hospital_id)
      .map((e) => e.hospital_id as string)
  );
  const out: HealEventSummary[] = [];
  for (const e of events) {
    if (e.event === "heal_triggered") {
      out.push({
        collector_id: e.collector_id,
        reason: e.detail,
        success: e.hospital_id ? succeeded.has(e.hospital_id) : false,
        timestamp: e.ts,
      });
    } else if (e.event === "heal_resumed") {
      out.push({
        collector_id: e.collector_id,
        reason: e.detail,
        success: true,
        timestamp: e.ts,
      });
    } else if (e.event === "heal_failed") {
      out.push({
        collector_id: e.collector_id,
        reason: e.detail,
        success: false,
        timestamp: e.ts,
      });
    }
  }
  return out.slice(-10);
}

function lastUpdatedFromResults(
  results: Record<string, import("@/lib/types").FacilityResult>
): string {
  const times = Object.values(results)
    .map((f) => f.scraped_at)
    .filter((t): t is string => !!t);
  return times.length ? times.sort().pop()! : new Date().toISOString();
}

export function useScrapeJob() {
  const {
    patientProfile,
    setScrapeJobId,
    setScrapeStatus,
    setJourneyPhase,
    setFacilities,
    setScrapeEvents,
    setScrapeLastUpdated,
    setScrapeHealEvents,
    setExecutiveSummary,
    setLlmExplanation,
    setScrapePresentationMode,
    setReplayEvents,
    scrapeJobId,
    replayEvents,
  } = useAppContext();
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyResults = useCallback(
    (
      results: Record<string, import("@/lib/types").FacilityResult>,
      events: ScraperLog[],
      profile: PatientProfile
    ) => {
      const summary = buildScrapeExecutiveSummary(profile, results, events);
      setFacilities(results);
      setScrapeEvents(events);
      setExecutiveSummary(summary);
      if (AGENTIC_RESULTS) {
        setLlmExplanation(null);
      } else if (summary) {
        setLlmExplanation(buildDeterministicExplanation(profile, results, summary, events));
      }
    },
    [setFacilities, setScrapeEvents, setExecutiveSummary, setLlmExplanation]
  );

  const fetchLlmExplanation = useCallback(
    async (results: Record<string, unknown>, profile: PatientProfile) => {
      if (!USE_LLM_EXPLANATION_EFFECTIVE) return;
      try {
        const res = await fetch(`${BACKEND}/api/analyse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            facilities: results,
            userPreferences: {
              priority: profile.priorities?.[0] ?? "cost",
              procedure: profile.procedure || profile.condition,
              insurance: profile.insurance,
              zipCode: profile.zipCode,
              radiusMi: profile.radiusMi,
            },
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const { normalizeLlmExplanation } = await import("@/lib/llmExplanation");
        const normalized = normalizeLlmExplanation(data);
        if (normalized) setLlmExplanation(normalized);
      } catch {
        /* deterministic explanation already set */
      }
    },
    [setLlmExplanation]
  );

  const fetchCachedQuery = useCallback(
    async (profile: PatientProfile): Promise<{
      results: Record<string, import("@/lib/types").FacilityResult>;
      events: ScraperLog[];
      replayEvents: ScraperLog[];
      lastUpdated?: string;
      healEvents?: Array<{ collector_id?: string; reason?: string; success?: boolean; timestamp?: string }>;
    } | null> => {
      try {
        const params = new URLSearchParams({
          zip: profile.zipCode || "",
          procedure: profile.procedure || profile.condition || "",
          insurance: profile.insurance || "",
        });
        if (profile.cptCode) params.set("cpt", profile.cptCode);
        const res = await fetch(`${BACKEND}/api/prices/query?${params}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.results || Object.keys(data.results).length === 0) return null;
        return {
          results: data.results,
          events: data.events?.length ? data.events : data.replayEvents ?? [],
          replayEvents: data.replayEvents?.length ? data.replayEvents : data.events ?? [],
          lastUpdated: data.lastUpdated,
          healEvents: data.healEvents ?? [],
        };
      } catch {
        return null;
      }
    },
    []
  );

  const pollUntilComplete = useCallback(
    async (jobId: string) => {
      const poll = async () => {
        try {
          const res = await fetch(`${BACKEND}/api/scrape/${jobId}/results`);
          if (!res.ok) throw new Error(`Scrape poll failed (${res.status})`);
          const data = await res.json();

          if (data.status === "complete") {
            const results = data.results ?? {};
            const events = data.events ?? [];
            const profileForSummary = data.profile ?? patientProfile;
            setScrapeStatus("complete");
            applyResults(results, events, profileForSummary);
            if (events.length) setReplayEvents(events);
            setScrapeHealEvents(healEventsFromLogs(events));
            setScrapeLastUpdated(lastUpdatedFromResults(results));
            void fetchLlmExplanation(results, profileForSummary);
            return;
          }

          if (data.status === "failed" || data.status === "cancelled") {
            setScrapeStatus(data.status);
            setScrapeEvents(data.events ?? []);
            return;
          }

          pollingRef.current = setTimeout(poll, 1200);
        } catch {
          setScrapeStatus("failed");
        }
      };
      poll();
    },
    [patientProfile, setScrapeStatus, applyResults, fetchLlmExplanation, setScrapeEvents, setReplayEvents, setScrapeHealEvents, setScrapeLastUpdated]
  );

  /** Proof-reel: real events animation + results loaded in parallel */
  const startProofReelFlow = useCallback(
    async (profileOverride?: PatientProfile) => {
      if (pollingRef.current) clearTimeout(pollingRef.current);

      stopAllVoice();
      resetVoiceQueue();

      const profile = profileOverride ?? patientProfile;
      const profileForDemo: PatientProfile = {
        ...profile,
        radiusMi: profile.radiusMi > 0 ? profile.radiusMi : 25,
      };

      let replay: ScraperLog[] = [];
      let results: Record<string, import("@/lib/types").FacilityResult>;
      let events: ScraperLog[];

      const cached = await fetchCachedQuery(profileForDemo);
      if (cached) {
        results = cached.results;
        events = cached.events;
        replay = cached.replayEvents;
        setScrapeLastUpdated(cached.lastUpdated ?? lastUpdatedFromResults(results));
        setScrapeHealEvents(
          cached.healEvents?.length
            ? cached.healEvents
            : healEventsFromLogs(replay.length ? replay : events)
        );
      } else {
        results = applyProfileToDemoResults(profileForDemo, AUSTIN_DEMO_SNAPSHOT.results);
        events = applyProfileToDemoEvents(profileForDemo, AUSTIN_DEMO_SNAPSHOT.events);
        replay = getDemoReplayEvents(profileForDemo);
        setScrapeLastUpdated(lastUpdatedFromResults(results));
        setScrapeHealEvents(healEventsFromLogs(replay.length ? replay : events));
      }

      setReplayEvents(replay);
      applyResults(results, events, profileForDemo);
      void fetchLlmExplanation(results, profileForDemo);
      setScrapeJobId(null);
      setScrapePresentationMode("proof-reel");
      setScrapeStatus("running");
      setJourneyPhase("scraping");
    },
    [
      patientProfile,
      setScrapeJobId,
      setScrapePresentationMode,
      setReplayEvents,
      setScrapeStatus,
      applyResults,
      setJourneyPhase,
      fetchCachedQuery,
      setScrapeLastUpdated,
      setScrapeHealEvents,
      fetchLlmExplanation,
    ]
  );

  const startDemoScrapeFlow = useCallback(
    (profileOverride?: PatientProfile) => {
      void startProofReelFlow(profileOverride);
    },
    [startProofReelFlow]
  );

  const loadInstantDemo = useCallback(
    (profileOverride?: PatientProfile) => {
      if (pollingRef.current) clearTimeout(pollingRef.current);

      const profile = profileOverride ?? patientProfile;
      const profileForDemo: PatientProfile = {
        ...profile,
        radiusMi: profile.radiusMi > 0 ? profile.radiusMi : 25,
      };

      const results = applyProfileToDemoResults(profileForDemo, AUSTIN_DEMO_SNAPSHOT.results);
      const events = applyProfileToDemoEvents(profileForDemo, AUSTIN_DEMO_SNAPSHOT.events);
      const replay = getDemoReplayEvents(profileForDemo);

      setScrapeJobId(null);
      setScrapePresentationMode("instant");
      setReplayEvents(replay);
      setScrapeStatus("complete");
      setScrapeLastUpdated(lastUpdatedFromResults(results));
      setScrapeHealEvents(healEventsFromLogs(replay.length ? replay : events));
      applyResults(results, events, profileForDemo);
      void fetchLlmExplanation(results, profileForDemo);
      setJourneyPhase("results");
    },
    [
      patientProfile,
      setScrapeJobId,
      setScrapePresentationMode,
      setReplayEvents,
      setScrapeStatus,
      applyResults,
      setJourneyPhase,
      setScrapeLastUpdated,
      setScrapeHealEvents,
      fetchLlmExplanation,
    ]
  );

  const startReplayScrape = useCallback(() => {
    if (!replayEvents.length) {
      const replay = getDemoReplayEvents(patientProfile);
      if (replay.length) setReplayEvents(replay);
    }
    setScrapePresentationMode("proof-reel");
    setScrapeStatus("running");
    setScrapeJobId(null);
    setJourneyPhase("scraping");
  }, [
    replayEvents,
    patientProfile,
    setReplayEvents,
    setScrapePresentationMode,
    setScrapeStatus,
    setScrapeJobId,
    setJourneyPhase,
  ]);

  const startLiveScrape = useCallback(
    async (profileOverride?: PatientProfile) => {
      if (pollingRef.current) clearTimeout(pollingRef.current);

      const profile = profileOverride ?? patientProfile;
      const profileForScrape: PatientProfile = {
        ...profile,
        radiusMi: profile.radiusMi > 0 ? profile.radiusMi : 25,
      };

      stopAllVoice();
      resetVoiceQueue();

      setScrapePresentationMode("live");
      setScrapeStatus("running");
      setJourneyPhase("scraping");
      setFacilities({});
      setScrapeEvents([]);
      setExecutiveSummary(null);
      setLlmExplanation(null);

      try {
        const res = await fetch(`${BACKEND}/api/scrape/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: profileForScrape }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Scrape start failed");
        setScrapeJobId(data.jobId);
        void pollUntilComplete(data.jobId);
      } catch {
        setScrapeStatus("failed");
      }
    },
    [
      patientProfile,
      setScrapeJobId,
      setScrapePresentationMode,
      setScrapeStatus,
      setJourneyPhase,
      setFacilities,
      setScrapeEvents,
      setExecutiveSummary,
      setLlmExplanation,
      pollUntilComplete,
    ]
  );

  const startScrape = useCallback(
    async (profileOverride?: PatientProfile) => {
      const profile = profileOverride ?? patientProfile;
      const profileNorm: PatientProfile = {
        ...profile,
        radiusMi: profile.radiusMi > 0 ? profile.radiusMi : 25,
      };

      if (SKIP_SCRAPE_ANIMATION) {
        loadInstantDemo(profileNorm);
        return;
      }

      const cacheStatus = await checkZipCache(profileNorm);
      const hasCache = cacheStatus?.cached === true;

      if (HACKATHON_DEMO_MODE && !hasCache) {
        await startLiveScrape(profileNorm);
        return;
      }

      if (hasCache) {
        await startProofReelFlow(profileNorm);
        return;
      }

      await startLiveScrape(profileNorm);
    },
    [patientProfile, loadInstantDemo, startLiveScrape, startProofReelFlow]
  );

  const cancelScrape = useCallback(async () => {
    if (pollingRef.current) clearTimeout(pollingRef.current);
    if (!scrapeJobId) {
      setScrapeStatus("cancelled");
      return;
    }
    try {
      await fetch(`${BACKEND}/api/scrape/${scrapeJobId}`, { method: "DELETE" });
      setScrapeStatus("cancelled");
    } catch {
      setScrapeStatus("failed");
    }
  }, [scrapeJobId, setScrapeStatus]);

  return {
    startScrape,
    checkZipCache,
    loadInstantDemo,
    startDemoScrapeFlow,
    startProofReelFlow,
    startReplayScrape,
    startLiveScrape,
    cancelScrape,
    scrapeJobId,
  };
}
