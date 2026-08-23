"use client";

import { useCallback, useRef } from "react";
import { useAppContext } from "@/context/AppContext";
import { stopAllVoice } from "@/lib/ariaVoiceController";
import { resetVoiceQueue } from "@/lib/ttsSpeak";
import { getDemoReplayEvents } from "@/lib/demoSnapshot";
import type { PatientProfile } from "@/lib/types";
import { checkZipCache } from "@/lib/zipCacheCheck";
import type { BrainSessionResponse } from "@/lib/scrapeSession";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
const AGENTIC_RESULTS = process.env.NEXT_PUBLIC_AGENTIC_RESULTS === "true";
const HACKATHON_DEMO_MODE = process.env.NEXT_PUBLIC_HACKATHON_DEMO_MODE === "true";
const SKIP_SCRAPE_ANIMATION = process.env.NEXT_PUBLIC_SKIP_SCRAPE_ANIMATION === "true";

async function createBrainSession(
  profile: PatientProfile,
  opts: { mode?: string; instant?: boolean } = {}
): Promise<BrainSessionResponse> {
  const res = await fetch(`${BACKEND}/api/scrape/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile,
      mode: opts.mode ?? "auto",
      instant: opts.instant === true,
      agentic: AGENTIC_RESULTS,
    }),
  });
  const data = (await res.json()) as BrainSessionResponse & { error?: string };
  if (!res.ok) throw new Error(data.error || `session failed (${res.status})`);
  return data;
}

async function fetchBrainSession(sessionId: string): Promise<BrainSessionResponse> {
  const qs = AGENTIC_RESULTS ? "?agentic=true" : "";
  const res = await fetch(`${BACKEND}/api/scrape/session/${sessionId}${qs}`);
  const data = (await res.json()) as BrainSessionResponse & { error?: string };
  if (!res.ok) throw new Error(data.error || `session poll failed (${res.status})`);
  return data;
}

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
    applyBrainSession,
    scrapeJobId,
    replayEvents,
    setReplayEvents,
  } = useAppContext();
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginScrapeUi = useCallback(
    (mode: "live" | "proof-reel" | "instant") => {
      setScrapePresentationMode(mode);
      setScrapeStatus(mode === "instant" ? "complete" : "running");
      setJourneyPhase(mode === "instant" ? "results" : "scraping");
    },
    [setScrapePresentationMode, setScrapeStatus, setJourneyPhase]
  );

  const pollUntilComplete = useCallback(
    (sessionId: string) => {
      const poll = async () => {
        try {
          const session = await fetchBrainSession(sessionId);
          if (session.status === "complete") {
            applyBrainSession(session);
            setScrapeStatus("complete");
            return;
          }
          if (session.status === "running") {
            pollingRef.current = setTimeout(poll, 1200);
            return;
          }
          setScrapeStatus("failed");
        } catch {
          setScrapeStatus("failed");
        }
      };
      void poll();
    },
    [applyBrainSession, setScrapeStatus]
  );

  const runSession = useCallback(
    async (profile: PatientProfile, opts: { mode?: string; instant?: boolean } = {}) => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
      stopAllVoice();
      resetVoiceQueue();

      setFacilities({});
      setScrapeEvents([]);
      setExecutiveSummary(null);
      setLlmExplanation(null);

      const session = await createBrainSession(profile, opts);

      if (session.status === "running" && session.jobId) {
        setScrapeJobId(session.jobId);
        beginScrapeUi("live");
        pollUntilComplete(session.jobId);
        return session;
      }

      applyBrainSession(session);
      beginScrapeUi(session.presentationMode === "instant" ? "instant" : "proof-reel");
      setScrapeJobId(null);
      return session;
    },
    [
      setFacilities,
      setScrapeEvents,
      setExecutiveSummary,
      setLlmExplanation,
      setScrapeJobId,
      applyBrainSession,
      beginScrapeUi,
      pollUntilComplete,
    ]
  );

  const startProofReelFlow = useCallback(
    async (profileOverride?: PatientProfile) => {
      const profile = profileOverride ?? patientProfile;
      const profileNorm: PatientProfile = {
        ...profile,
        radiusMi: profile.radiusMi > 0 ? profile.radiusMi : 25,
      };
      await runSession(profileNorm, { mode: "cached" });
    },
    [patientProfile, runSession]
  );

  const startDemoScrapeFlow = useCallback(
    (profileOverride?: PatientProfile) => {
      void startProofReelFlow(profileOverride);
    },
    [startProofReelFlow]
  );

  const loadInstantDemo = useCallback(
    async (profileOverride?: PatientProfile) => {
      const profile = profileOverride ?? patientProfile;
      const profileNorm: PatientProfile = {
        ...profile,
        radiusMi: profile.radiusMi > 0 ? profile.radiusMi : 25,
      };
      await runSession(profileNorm, { instant: true });
    },
    [patientProfile, runSession]
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
      const profile = profileOverride ?? patientProfile;
      const profileNorm: PatientProfile = {
        ...profile,
        radiusMi: profile.radiusMi > 0 ? profile.radiusMi : 25,
      };
      await runSession(profileNorm, { mode: "live" });
    },
    [patientProfile, runSession]
  );

  const startScrape = useCallback(
    async (profileOverride?: PatientProfile) => {
      const profile = profileOverride ?? patientProfile;
      const profileNorm: PatientProfile = {
        ...profile,
        radiusMi: profile.radiusMi > 0 ? profile.radiusMi : 25,
      };

      if (SKIP_SCRAPE_ANIMATION) {
        await loadInstantDemo(profileNorm);
        return;
      }

      const cacheStatus = await checkZipCache(profileNorm);
      const hasCache = cacheStatus?.cached === true;
      const zipKnown = cacheStatus?.zipKnown !== false;

      if (HACKATHON_DEMO_MODE && !hasCache && zipKnown) {
        await startLiveScrape(profileNorm);
        return;
      }

      if (hasCache || !zipKnown) {
        // Austin ZIP with cache, or out-of-coverage ZIP → proof-reel + honest snapshot fallback
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
