/**
 * Clearweb Health Backend — Express API Server
 */

"use strict";

const express = require("express");
const cors = require("cors");
const { env, validateEnv } = require("./config/env");
const { BRAND } = require("./lib/brand");
const { checkOllamaHealth } = require("./services/ollamaProvider");
const { checkTtsHealth, synthesizeSpeech } = require("./services/ttsService");
const { checkSttHealth, transcribeAudio } = require("./services/sttService");
const { handleAgentChatStream, extractProfile, analyseResults } = require("./services/ariaAgent");
const scrapeService = require("./services/scrapeService");
const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const app = express();

app.use(cors({ origin: env.FRONTEND_URL }));
app.use(express.json({ limit: "2mb" }));

validateEnv().forEach((w) => console.warn(`[env] ${w}`));

// ─── Health ─────────────────────────────────────────────────────────────────

app.get("/api/health", async (_req, res) => {
  const ollama = await checkOllamaHealth();
  const tts = await checkTtsHealth();
  const stt = await checkSttHealth();
  const status = ollama.connected ? "ok" : "degraded";
  res.status(status === "ok" ? 200 : 503).json({
    status,
    ollama: ollama.connected ? "connected" : "unreachable",
    model: env.OLLAMA_MODEL,
    available: ollama.models,
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
    const audio = await synthesizeSpeech(text, { voice, rate, pitch });
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(audio);
  } catch (err) {
    console.error("[tts]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── STT (local Whisper via Ollama) ─────────────────────────────────────────

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

// ─── Scrape jobs ────────────────────────────────────────────────────────────

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
  console.log(`\n🕸️  ${BRAND.name} API  →  http://localhost:${env.PORT}`);
  console.log(`   Model: ${env.OLLAMA_MODEL}  |  Ollama: ${env.OLLAMA_BASE}`);
  console.log(`   TTS: ${env.TTS_VOICE} (${env.TTS_RATE})`);
  console.log(`   STT: Xenova/whisper-tiny.en (local, first request loads model)`);
  console.log(`   Frontend: ${env.FRONTEND_URL}\n`);

  const { checkSttHealth } = require("./services/sttService");
  checkSttHealth()
    .then((stt) => {
      if (stt.available) console.log("[stt] Whisper model ready");
      else console.warn("[stt]", stt.reason);
    })
    .catch((err) => console.warn("[stt] preload skipped:", err.message));
});
