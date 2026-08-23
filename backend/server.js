/**
 * Clearweb Health Backend — Express API Server
 */

"use strict";

const express = require("express");
const cors = require("cors");
const { env, validateEnv } = require("./config/env");
const { BRAND } = require("./lib/brand");
const { checkLlmHealth } = require("./services/llmProvider");
const { checkTtsHealth, synthesizeSpeech, warmupTts } = require("./services/ttsService");
const { checkSttHealth, transcribeAudio } = require("./services/sttService");
const { handleAgentChatStream, extractProfile, analyseResults } = require("./services/ariaAgent");
const { conductResults } = require("./services/resultsConductor");
const { createSession, getSession } = require("./services/brainService");
const { runCollectorStatus } = require("./services/collectorStatusService");
const { runCollectorHeal } = require("./services/collectorHealService");
const scrapeService = require("./services/scrapeService");
const { queryCachedPrices } = require("./services/priceQueryService");
const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const app = express();

app.use(cors({ origin: env.FRONTEND_URL }));
app.use(express.json({ limit: "2mb" }));

validateEnv().forEach((w) => console.warn(`[env] ${w}`));

app.get("/", (_req, res) => {
  res.redirect(302, env.FRONTEND_URL);
});

// ─── Health ─────────────────────────────────────────────────────────────────

app.get("/api/health", async (_req, res) => {
  const llm = await checkLlmHealth();
  const tts = await checkTtsHealth();
  const stt = await checkSttHealth();
  const status = llm.connected ? "ok" : "degraded";
  res.status(status === "ok" ? 200 : 503).json({
    status,
    llm,
    tts,
    stt,
    webcmd: env.WEBCMD_ENABLED,
  });
});

// ─── Unified agent chat ─────────────────────────────────────────────────────

app.post("/api/agent/chat", (req, res) => handleAgentChatStream(req, res, req.body));

/** @deprecated use /api/agent/chat */
app.post("/api/chat", (req, res) => handleAgentChatStream(req, res, req.body));

// ─── TTS ────────────────────────────────────────────────────────────────────

app.post("/api/tts/speak", async (req, res) => {
  const { text, voice, rate, pitch } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text required" });
  try {
    const { buffer, mime, provider } = await synthesizeSpeech(text, { voice, rate, pitch });
    res.setHeader("Content-Type", mime);
    res.setHeader("X-TTS-Provider", provider);
    res.send(buffer);
  } catch (err) {
    console.error("[tts]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── STT (local Whisper via Transformers.js) ────────────────────────────────

app.post("/api/stt/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ error: "audio file required" });
  }
  try {
    const text = await transcribeAudio(
      req.file.buffer,
      req.file.originalname || "recording.webm",
      req.file.mimetype || "audio/webm"
    );
    res.json({ text });
  } catch (err) {
    console.error("[stt]", err.message);
    res.status(503).json({ error: err.message });
  }
});

// ─── Profile extraction ─────────────────────────────────────────────────────

app.post("/api/agent/extract-profile", async (req, res) => {
  try {
    const profile = await extractProfile(req.body.messages || []);
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Results & analysis ─────────────────────────────────────────────────────

app.post("/api/analyse", async (req, res) => {
  try {
    const analysis = await analyseResults(req.body.facilities, req.body.userPreferences);
    res.json({ analysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Autonomous results walkthrough — LLM + webcmd UI choreography */
app.post("/api/agent/conduct-results", async (req, res) => {
  try {
    const result = await conductResults({
      profile: req.body.profile,
      facilities: req.body.facilities,
      presentationMode: req.body.presentationMode,
      healEvents: req.body.healEvents,
      executiveSummary: req.body.executiveSummary,
      scrapeContext: req.body.scrapeContext,
    });
    res.json(result);
  } catch (err) {
    console.error("[conduct-results]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Autonomous brain session (unified scrape + explain + replay) ───────────

app.post("/api/scrape/session", async (req, res) => {
  try {
    const session = await createSession({
      profile: req.body.profile || req.body,
      mode: req.body.mode || "auto",
      agentic: req.body.agentic,
      instant: req.body.instant === true,
    });
    res.json(session);
  } catch (err) {
    console.error("[scrape/session]", err.message);
    res.status(503).json({ error: err.message });
  }
});

app.get("/api/scrape/session/:sessionId", async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId, {
      agentic: req.query.agentic === "true" || req.query.agentic === "1",
    });
    if (!session) return res.status(404).json({ error: "session not found" });
    res.json(session);
  } catch (err) {
    console.error("[scrape/session/:id]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Bright Data collector pipeline status (jobs DB + heal events) */
app.get("/api/collectors/status", async (_req, res) => {
  try {
    const status = await runCollectorStatus();
    res.json(status);
  } catch (err) {
    console.error("[collectors/status]", err.message);
    res.status(503).json({ error: err.message });
  }
});

/** Trigger Bright Data self-heal on a collector (judge demo / brain recovery) */
app.post("/api/collectors/heal", async (req, res) => {
  try {
    const { collectorId, reason, seedUrl, slug, name, domain, tier, rerun } = req.body || {};
    if (!collectorId || !reason) {
      return res.status(400).json({ error: "collectorId and reason required" });
    }
    const result = await runCollectorHeal({
      collectorId,
      reason,
      seedUrl,
      slug,
      name,
      domain,
      tier: typeof tier === "number" ? tier : 1,
      rerun: rerun !== false,
    });
    res.json(result);
  } catch (err) {
    console.error("[collectors/heal]", err.message);
    res.status(503).json({ error: err.message });
  }
});

// ─── Scrape jobs ────────────────────────────────────────────────────────────

app.get("/api/prices/query", async (req, res) => {
  try {
    const data = await queryCachedPrices({
      zip: req.query.zip,
      procedure: req.query.procedure,
      insurance: req.query.insurance,
      cpt: req.query.cpt,
    });
    res.json(data);
  } catch (err) {
    console.error("[prices/query]", err.message);
    res.status(503).json({ error: err.message });
  }
});

app.get("/api/prices/cache-check", async (req, res) => {
  try {
    const data = await queryCachedPrices({
      zip: req.query.zip,
      radius: parseFloat(req.query.radius || "25"),
      check: true,
    });
    res.json(data);
  } catch (err) {
    console.error("[prices/cache-check]", err.message);
    res.status(503).json({ error: err.message });
  }
});

app.post("/api/scrape/start", (req, res) => {
  const profile = req.body.profile || req.body;
  const result = scrapeService.startScrape(profile);
  if (result.error) {
    return res.status(503).json({ error: result.error });
  }
  res.json({ jobId: result.jobId, status: result.status });
});

app.delete("/api/scrape/:jobId", (req, res) => {
  const result = scrapeService.cancelJob(req.params.jobId);
  if (result.error && !result.jobId) {
    return res.status(result.status ? 409 : 404).json({ error: result.error });
  }
  res.json(result);
});

app.get("/api/scrape/:jobId/results", (req, res) => {
  const data = scrapeService.getResults(req.params.jobId);
  if (!data) return res.status(404).json({ error: "job not found" });
  res.json(data);
});

app.get("/api/scrape/:jobId/events", (req, res) => {
  const job = scrapeService.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "job not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let cursor = 0;
  const interval = setInterval(() => {
    const newEvents = scrapeService.getEventsSince(req.params.jobId, cursor);
    for (const evt of newEvents) {
      cursor++;
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    }
    const current = scrapeService.getJob(req.params.jobId);
    if (current?.status === "complete" || current?.status === "failed" || current?.status === "cancelled") {
      res.write(
        `data: ${JSON.stringify({
          type: current.status === "failed" ? "failed" : current.status === "cancelled" ? "cancelled" : "complete",
          jobId: req.params.jobId,
          error: current.error,
          stats: current.stats || {},
        })}\n\n`
      );
      clearInterval(interval);
      res.end();
    }
  }, 800);

  req.on("close", () => clearInterval(interval));
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(env.PORT, () => {
  const { activeProvider } = require("./services/llmProvider");
  const llm = activeProvider();
  console.log(`\n🕸️  ${BRAND.name} API  →  http://localhost:${env.PORT}`);
  console.log(
    llm === "groq"
      ? `   LLM: Groq ${env.GROQ_LLM_MODEL || "openai/gpt-oss-120b"}`
      : `   Model: ${env.OLLAMA_MODEL}  |  Ollama: ${env.OLLAMA_BASE}`
  );
  console.log(
    `   TTS: ${env.TTS_PROVIDER === "groq" || env.GROQ_API_KEY ? env.GROQ_TTS_MODEL : env.TTS_VOICE} (${env.GROQ_API_KEY ? "groq" : "edge"})`
  );
  console.log(`   Frontend: ${env.FRONTEND_URL}\n`);

  warmupTts([`Hi, I'm ${BRAND.agentName}. What do you need priced today?`]).catch((err) =>
    console.warn("[tts] warmup failed:", err.message)
  );

  const { checkSttHealth } = require("./services/sttService");
  checkSttHealth()
    .then((stt) => {
      console.log(`   STT: ${stt.model} (${stt.preset || "custom"}, first request caches weights)`);
      if (stt.available) console.log("[stt] model ready");
      else console.warn("[stt]", stt.reason);
    })
    .catch((err) => console.warn("[stt] preload skipped:", err.message));
});
