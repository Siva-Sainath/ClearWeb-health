"use strict";

/**
 * Autonomous brain — single entry point for scrape data, replays, summaries, and explanations.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { queryCachedPrices } = require("./priceQueryService");
const scrapeService = require("./scrapeService");
const { buildScrapeContext, healEventsFromLogs } = require("./scrapeContext");
const { buildExecutiveSummary } = require("./executiveSummary");
const { buildDeterministicExplanation } = require("./deterministicExplanation");
const { conductResults } = require("./resultsConductor");

const DEMO_SNAPSHOT_PATH = path.join(
  __dirname,
  "../../frontend/src/data/austinDemoSnapshot.json"
);

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
  const proc = profile.procedure || profile.condition || "your procedure";
  const cpt = profile.cptCode || "";
  const network = profile.insurance || "";
  const out = {};
  for (const [id, f] of Object.entries(results || {})) {
    out[id] = {
      ...f,
      procedure: proc,
      cpt_code: cpt || f.cpt_code,
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
  const executiveSummary = buildExecutiveSummary(profile, results, replay);
  const explanation =
    agentic || !executiveSummary
      ? null
      : buildDeterministicExplanation(profile, results, executiveSummary, replay, scrapeContext);

  let presentation = null;
  if (agentic && executiveSummary && Object.keys(results).length > 0) {
    presentation = await conductResults({
      profile,
      facilities: results,
      presentationMode,
      healEvents: heals,
      executiveSummary,
      scrapeContext,
      queueWebcmd: false,
    });
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
    explanationSource: agentic ? "conductor" : "deterministic",
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
