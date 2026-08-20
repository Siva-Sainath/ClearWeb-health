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

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
const USE_LLM_EXPLANATION = process.env.NEXT_PUBLIC_USE_LLM_EXPLANATION === "true";
const USE_INSTANT_DEMO = process.env.NEXT_PUBLIC_DEMO_INSTANT_RESULTS !== "false";

export function useScrapeJob() {
  const {
    patientProfile,
    setScrapeJobId,
    setScrapeStatus,
    setJourneyPhase,
    setFacilities,
    setScrapeEvents,
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
      if (summary) {
        setLlmExplanation(buildDeterministicExplanation(profile, results, summary, events));
      }
    },
    [setFacilities, setScrapeEvents, setExecutiveSummary, setLlmExplanation]
  );

  const fetchLlmExplanation = useCallback(
    async (results: Record<string, unknown>, profile: PatientProfile) => {
      if (!USE_LLM_EXPLANATION) return;
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
            void fetchLlmExplanation(results, profileForSummary);
            pollingRef.current = setTimeout(() => {
              setJourneyPhase("results");
            }, 1400);
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
    [
      patientProfile,
      setScrapeStatus,
      setJourneyPhase,
      applyResults,
      fetchLlmExplanation,
      setScrapeEvents,
    ]
  );

  /** Demo flow: replay scrape animation + Aria narration, then results. */
  const startDemoScrapeFlow = useCallback(
    (profileOverride?: PatientProfile) => {
      if (pollingRef.current) clearTimeout(pollingRef.current);

      stopAllVoice();
      resetVoiceQueue();

      const profile = profileOverride ?? patientProfile;
      const profileForDemo: PatientProfile = {
        ...profile,
        radiusMi: profile.radiusMi > 0 ? profile.radiusMi : 25,
      };

      const results = applyProfileToDemoResults(profileForDemo, AUSTIN_DEMO_SNAPSHOT.results);
      const events = applyProfileToDemoEvents(profileForDemo, AUSTIN_DEMO_SNAPSHOT.events);
      const replay = getDemoReplayEvents(profileForDemo);

      applyResults(results, events, profileForDemo);

      setScrapeJobId(null);
      setScrapePresentationMode("replay");
      setReplayEvents(replay);
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
    ]
  );

  /** Load pre-collected Austin hospital prices — skip scraping phase (dev shortcut). */
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
      applyResults(results, events, profileForDemo);
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
    ]
  );

  /** Fast-forward replay of how hospital sites were crawled (summary animation). */
  const startReplayScrape = useCallback(() => {
    if (!replayEvents.length) {
      const replay = getDemoReplayEvents(patientProfile);
      if (replay.length) setReplayEvents(replay);
    }
    setScrapePresentationMode("replay");
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

  /** Full Bright Data + Python scrape loop (live). */
  const startLiveScrape = useCallback(
    async (profileOverride?: PatientProfile) => {
      if (pollingRef.current) clearTimeout(pollingRef.current);

      const profile = profileOverride ?? patientProfile;
      const profileForScrape: PatientProfile = {
        ...profile,
        radiusMi: profile.radiusMi > 0 ? profile.radiusMi : 25,
      };

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
      if (USE_INSTANT_DEMO) {
        startDemoScrapeFlow(profileOverride);
        return;
      }
      await startLiveScrape(profileOverride);
    },
    [startDemoScrapeFlow, startLiveScrape]
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
    loadInstantDemo,
    startDemoScrapeFlow,
    startReplayScrape,
    startLiveScrape,
    cancelScrape,
    scrapeJobId,
  };
}
