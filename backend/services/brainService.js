"use strict";

/**
 * Autonomous brain — single entry point for scrape data, replays, summaries, and explanations.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { coverageBlockFromProfile } = require("../lib/coverageGate");
const { queryCachedPrices } = require("./priceQueryService");
const scrapeService = require("./scrapeService");
const { buildScrapeContext, healEventsFromLogs } = require("./scrapeContext");
const { buildExecutiveSummary } = require("./executiveSummary");
const { buildDeterministicExplanation } = require("./deterministicExplanation");
const { conductResults } = require("./resultsConductor");
const { runCollectorStatus } = require("./collectorStatusService");

const DEMO_SNAPSHOT_PATH = path.join(
  __dirname,
  "../../frontend/src/data/austinDemoSnapshot.json"
);

const TEXAS_COLLECTOR_SNAPSHOT_PATH = path.join(
  __dirname,
  "../../frontend/src/data/texasCollectorSnapshot.json"
);

function loadTexasCollectorSnapshot() {
  if (!fs.existsSync(TEXAS_COLLECTOR_SNAPSHOT_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(TEXAS_COLLECTOR_SNAPSHOT_PATH, "utf-8"));
    return {
      verified: raw.verified ?? 0,
      pending: raw.pending ?? 0,
      failed: raw.failed ?? 0,
      asOf: raw.asOf || new Date().toISOString(),
      recentFailures: (raw.recent || [])
        .filter((j) => j.status === "failed")
        .slice(0, 5),
    };
  } catch {
    return null;
  }
}

function normalizeProfile(profile = {}) {
  return {
    condition: "",
    procedure: "",
    cptCode: "",
    insurance: "",
    city: "",
    zipCode: "",
    radiusMi: 25,
    priorities: ["cost"],
    ...profile,
    radiusMi: Number(profile.radiusMi) > 0 ? Number(profile.radiusMi) : 25,
  };
}

function isAgenticEnabled(flag) {
  if (typeof flag === "boolean") return flag;
  return process.env.AGENTIC_RESULTS === "true";
}

function loadDemoSnapshot() {
  if (!fs.existsSync(DEMO_SNAPSHOT_PATH)) return null;
  return JSON.parse(fs.readFileSync(DEMO_SNAPSHOT_PATH, "utf-8"));
}

function applyProfileToDemoResults(profile, results) {
  const network = profile.insurance || "";
  const out = {};
  for (const [id, f] of Object.entries(results || {})) {
    out[id] = {
      ...f,
      network: network || f.network,
    };
  }
  return out;
}

function applyProfileToDemoEvents(profile, events) {
  const proc = profile.procedure || profile.condition || "";
  return (events || []).map((e) => ({
    ...e,
    cpt_code: e.cpt_code || profile.cptCode || "",
    network: e.network || profile.insurance || "",
    detail: e.detail?.replace?.(/your procedure/gi, proc) ?? e.detail,
  }));
}

async function resolveMode(profile, mode) {
  if (mode === "instant" || mode === "live" || mode === "cached") return mode;
  const check = await queryCachedPrices({
    check: true,
    zip: profile.zipCode,
    radius: profile.radiusMi,
  });
  return check.cached ? "cached" : "live";
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/**
 * Build the full brain payload from scrape results + events.
 */
async function buildBrainPayload({
  profile,
  results,
  events = [],
  replayEvents = [],
  healEvents = [],
  lastUpdated,
  presentationMode,
  agentic = false,
}) {
  const replay = replayEvents.length ? replayEvents : events;
  const heals = healEvents.length ? healEvents : healEventsFromLogs(replay);
  const scrapeContext = buildScrapeContext({
    events,
    replayEvents: replay,
    healEvents: heals,
    presentationMode,
  });

  let collectorPipeline = null;
  try {
    collectorPipeline = await withTimeout(runCollectorStatus(), 2500, "collector status");
    if (collectorPipeline?.byStatus) {
      scrapeContext.collectorPipeline = {
        verified: collectorPipeline.verified,
        pending: collectorPipeline.pending,
        failed: collectorPipeline.failed,
        asOf: new Date().toISOString(),
        recentFailures: (collectorPipeline.recent || [])
          .filter((j) => j.status === "failed")
          .slice(0, 5),
      };
    }
  } catch {
    const snapshot = loadTexasCollectorSnapshot();
    if (snapshot) {
      scrapeContext.collectorPipeline = snapshot;
    }
  }

  const executiveSummary = buildExecutiveSummary(profile, results, replay);
  // Always ship the deterministic walkthrough — in agentic mode the client uses it
  // whenever the conductor has no steps or fails, so results are never silent.
  const explanation = executiveSummary
    ? buildDeterministicExplanation(profile, results, executiveSummary, replay, scrapeContext)
    : null;

  let presentation = null;
  if (agentic && executiveSummary && Object.keys(results).length > 0) {
    try {
      presentation = await withTimeout(
        conductResults({
          profile,
          facilities: results,
          presentationMode,
          healEvents: heals,
          executiveSummary,
          scrapeContext,
          queueWebcmd: false,
        }),
        8000,
        "results conductor"
      );
    } catch (err) {
      console.warn("[brain] deferring results walkthrough to the client:", err.message);
    }
  }

  return {
    profile,
    presentationMode,
    status: "complete",
    results,
    events,
    replayEvents: replay,
    healEvents: heals,
    lastUpdated: lastUpdated || new Date().toISOString(),
    scrapeContext,
    executiveSummary,
    explanation,
    explanationSource: agentic && presentation ? "conductor" : "deterministic",
    presentation,
  };
}

/**
 * POST /api/scrape/session — start or load a scrape brain session.
 */
async function createSession({ profile: rawProfile, mode = "auto", agentic, instant = false }) {
  const profile = normalizeProfile(rawProfile);
  const useAgentic = isAgenticEnabled(agentic);
  const resolvedMode = instant ? "instant" : await resolveMode(profile, mode);

  if (resolvedMode === "live") {
    const start = scrapeService.startScrape(profile);
    if (start.error) throw new Error(start.error);
    return {
      sessionId: start.jobId,
      jobId: start.jobId,
      status: "running",
      presentationMode: "live",
      profile,
      eventsUrl: `/api/scrape/${start.jobId}/events`,
      resultsUrl: `/api/scrape/session/${start.jobId}`,
    };
  }

  let data = {};
  try {
    data = await queryCachedPrices({
      zip: profile.zipCode,
      procedure: profile.procedure || profile.condition,
      insurance: profile.insurance,
      cpt: profile.cptCode,
      radius: profile.radiusMi,
    });
  } catch (err) {
    console.warn("[brain] cache query failed, using demo snapshot:", err.message);
  }

  let results = data.results || {};
  let events = data.events || [];
  let replayEvents = data.replayEvents || [];
  let healEvents = data.healEvents || [];
  let lastUpdated = data.lastUpdated;

  if (!Object.keys(results).length) {
    if (coverageBlockFromProfile(profile)) {
      results = {};
      events = [];
      replayEvents = [];
      healEvents = [];
    } else {
    const demo = loadDemoSnapshot();
    if (!demo) throw new Error("No cached prices and demo snapshot unavailable");
    results = applyProfileToDemoResults(profile, demo.results);
    events = applyProfileToDemoEvents(profile, demo.events);
    replayEvents = applyProfileToDemoEvents(
      profile,
      demo.replayEvents?.length ? demo.replayEvents : demo.events
    );
    healEvents = healEventsFromLogs(replayEvents);
    }
  } else if (!replayEvents.length) {
    const demo = loadDemoSnapshot();
    if (demo) {
      replayEvents = applyProfileToDemoEvents(
        profile,
        demo.replayEvents?.length ? demo.replayEvents : demo.events || []
      );
      if (!healEvents.length) healEvents = healEventsFromLogs(replayEvents);
    }
  }

  const presentationMode = resolvedMode === "instant" ? "instant" : "proof-reel";
  const brain = await buildBrainPayload({
    profile,
    results,
    events,
    replayEvents,
    healEvents,
    lastUpdated,
    presentationMode,
    agentic: useAgentic,
  });

  return {
    sessionId: `cached-${crypto.randomBytes(6).toString("hex")}`,
    ...brain,
  };
}

/**
 * GET /api/scrape/session/:sessionId — poll live job or return cached brain.
 */
async function getSession(sessionId, { agentic } = {}) {
  const job = scrapeService.getResults(sessionId);
  if (!job) return null;

  if (job.status === "running") {
    return {
      sessionId,
      jobId: sessionId,
      status: "running",
      presentationMode: "live",
      profile: job.profile,
      eventCount: job.events?.length ?? 0,
      eventsUrl: `/api/scrape/${sessionId}/events`,
    };
  }

  if (job.status === "failed" || job.status === "cancelled") {
    return {
      sessionId,
      jobId: sessionId,
      status: job.status,
      presentationMode: "live",
      profile: job.profile,
      error: job.error,
      events: job.events,
      healEvents: healEventsFromLogs(job.events || []),
    };
  }

  const heals = healEventsFromLogs(job.events);
  return buildBrainPayload({
    profile: job.profile,
    results: job.results,
    events: job.events,
    replayEvents: job.events,
    healEvents: heals,
    lastUpdated: new Date(job.completedAt || Date.now()).toISOString(),
    presentationMode: "live",
    agentic: isAgenticEnabled(agentic),
  });
}

module.exports = {
  createSession,
  getSession,
  buildBrainPayload,
  normalizeProfile,
};
