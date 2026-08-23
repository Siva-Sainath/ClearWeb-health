"use strict";

require("dotenv").config();

const env = {
  PORT: parseInt(process.env.PORT || "3001", 10),
  OLLAMA_BASE: process.env.OLLAMA_BASE || "http://localhost:11434",
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || "llama3.1:8b",
  WHISPER_MODEL: process.env.WHISPER_MODEL || "dimavz/whisper-tiny",
  BRIGHT_DATA_API_TOKEN:
    process.env.BRIGHT_DATA_API_TOKEN || process.env.BRIGHTDATA_API_KEY || "",
  BRIGHTDATA_UNLOCKER_ZONE: process.env.BRIGHTDATA_UNLOCKER_ZONE || "",
  SCRAPER_PYTHON: process.env.SCRAPER_PYTHON || "",
  WEBCMD_BRIDGE_SECRET:
    process.env.WEBCMD_BRIDGE_SECRET ||
    (process.env.NODE_ENV === "production" ? "" : "clearweb-dev-bridge"),
  WEBCMD_ENABLED: process.env.WEBCMD_ENABLED !== "false",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  TTS_PROVIDER: (process.env.TTS_PROVIDER || "auto").toLowerCase(),
  TTS_VOICE: process.env.TTS_VOICE || "en-US-AriaNeural",
  TTS_RATE: process.env.TTS_RATE || "+4%",
  TTS_PITCH: process.env.TTS_PITCH || "+0Hz",
  GROQ_TTS_MODEL: process.env.GROQ_TTS_MODEL || "canopylabs/orpheus-v1-english",
  GROQ_TTS_VOICE: process.env.GROQ_TTS_VOICE || "hannah",
  LLM_PROVIDER: (process.env.LLM_PROVIDER || "ollama").toLowerCase(),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
  OPENAI_BASE: process.env.OPENAI_BASE || "https://api.openai.com/v1",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "stealth/ox-alpha",
  OPENROUTER_REFERER: process.env.OPENROUTER_REFERER || "",
  OPENROUTER_APP_TITLE: process.env.OPENROUTER_APP_TITLE || "Clearweb Health",
  STT_PRESET: process.env.STT_PRESET || "fast",
  STT_PROVIDER: process.env.STT_PROVIDER || "auto",
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GROQ_LLM_MODEL: process.env.GROQ_LLM_MODEL || "llama-3.3-70b-versatile",
  GROQ_WHISPER_MODEL: process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo",
  S1_MINI_ENABLED: process.env.S1_MINI_ENABLED === "true",
  S1_MINI_MODEL: process.env.S1_MINI_MODEL || "s1-mini",
  S1_MINI_TIMEOUT_MS: parseInt(process.env.S1_MINI_TIMEOUT_MS || "15000", 10),
};

function validateEnv() {
  const warnings = [];
  if (!env.BRIGHT_DATA_API_TOKEN) {
    warnings.push("BRIGHT_DATA_API_TOKEN not set — scrape jobs will fail until configured");
  }
  if (!env.BRIGHTDATA_UNLOCKER_ZONE) {
    warnings.push(
      "BRIGHTDATA_UNLOCKER_ZONE not set — create a Web Unlocker zone at brightdata.com/cp/zones"
    );
  }
  if (process.env.NODE_ENV === "production" && !process.env.WEBCMD_BRIDGE_SECRET) {
    warnings.push("WEBCMD_BRIDGE_SECRET not set in production");
  }
  return warnings;
}

module.exports = { env, validateEnv };
