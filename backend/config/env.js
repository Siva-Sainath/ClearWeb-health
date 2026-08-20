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
  TTS_VOICE: process.env.TTS_VOICE || "en-US-AvaMultilingualNeural",
  TTS_RATE: process.env.TTS_RATE || "-4%",
  TTS_PITCH: process.env.TTS_PITCH || "-2Hz",
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
