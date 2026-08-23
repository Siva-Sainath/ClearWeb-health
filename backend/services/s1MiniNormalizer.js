"use strict";

const axios = require("axios");
const { env } = require("../config/env");

const S1_SYSTEM_PROMPT =
  "You are a text normalizer for speech-to-text transcripts. The input begins with a control line specifying the styling, structure, and context settings; clean the transcript to match those settings and output only the cleaned text.";

const DEFAULT_CONTROL = {
  styling: "semi-formal",
  structure: "prose",
  context: "general",
};

let availabilityCache = { checked: false, available: false, model: null };

function buildUserPrompt(rawText, control = {}) {
  const c = { ...DEFAULT_CONTROL, ...control };
  return `[Styling: ${c.styling}] [Structure: ${c.structure}] [Context: ${c.context}]\n${String(rawText || "").trim()}`;
}

function stripModelArtifacts(text) {
  return String(text || "")
    .replace(/[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, "")
    .trim();
}

async function checkS1MiniHealth() {
  if (!env.S1_MINI_ENABLED) {
    return { enabled: false, available: false, model: env.S1_MINI_MODEL, reason: "disabled" };
  }
  try {
    const { data } = await axios.get(`${env.OLLAMA_BASE}/api/tags`, { timeout: 3000 });
    const names = (data.models || []).map((m) => m.name);
    const match =
      names.find((n) => n === env.S1_MINI_MODEL) ||
      names.find((n) => n.startsWith(`${env.S1_MINI_MODEL}:`)) ||
      names.find((n) => n.includes("s1-mini"));
    availabilityCache = {
      checked: true,
      available: Boolean(match),
      model: match || env.S1_MINI_MODEL,
    };
    return {
      enabled: true,
      available: Boolean(match),
      model: match || env.S1_MINI_MODEL,
      reason: match ? null : `Model not in Ollama — run: ollama create s1-mini -f backend/models/s1-mini.Modelfile`,
    };
  } catch (err) {
    return {
      enabled: true,
      available: false,
      model: env.S1_MINI_MODEL,
      reason: err.message,
    };
  }
}

/**
 * Superwhisper S1-mini post-processor — cleans raw Whisper output.
 * Pipeline: audio → Whisper → S1-mini → clean text
 * @see https://huggingface.co/superwhisper/s1-mini-GGUF
 */
async function normalizeWithS1Mini(rawText, control) {
  const trimmed = String(rawText || "").trim();
  if (!trimmed || !env.S1_MINI_ENABLED) return trimmed;

  if (!availabilityCache.checked) {
    await checkS1MiniHealth();
  }
  if (!availabilityCache.available) {
    return trimmed;
  }

  const model = availabilityCache.model || env.S1_MINI_MODEL;

  try {
    const { data } = await axios.post(
      `${env.OLLAMA_BASE}/api/chat`,
      {
        model,
        messages: [
          { role: "system", content: S1_SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(trimmed, control) },
        ],
        stream: false,
        options: {
          temperature: 0,
          num_predict: 512,
        },
      },
      { timeout: env.S1_MINI_TIMEOUT_MS }
    );

    const cleaned = stripModelArtifacts(data.message?.content);
    // Empty string is valid when input was filler/noise only.
    return cleaned.length > 0 ? cleaned : "";
  } catch (err) {
    console.warn("[s1-mini]", err.message);
    return trimmed;
  }
}

module.exports = { normalizeWithS1Mini, checkS1MiniHealth, buildUserPrompt };
