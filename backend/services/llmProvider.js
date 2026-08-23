"use strict";

/**
 * LLM routing — swap providers via LLM_PROVIDER without changing agent code.
 *
 *   ollama     → local dev (default)
 *   openai     → hosted OpenAI-compatible
 *   openrouter → OpenRouter (e.g. stealth/ox-alpha — free tier)
 */

const { env } = require("../config/env");
const ollama = require("./ollamaProvider");
const openai = require("./openaiProvider");
const openrouter = require("./openrouterProvider");
const groq = require("./groqLlmProvider");

function activeProvider() {
  const p = env.LLM_PROVIDER;
  if (p === "openai") return "openai";
  if (p === "openrouter") return "openrouter";
  if (p === "groq") return "groq";
  if (p === "ollama") return "ollama";
  // Default: Groq when a key is present so the laptop is not running llama locally.
  if (groq.groqKey()) return "groq";
  return "ollama";
}

async function checkLlmHealth() {
  const provider = activeProvider();
  if (provider === "openai") {
    const health = await openai.checkOpenAIHealth();
    return { provider, ...health };
  }
  if (provider === "openrouter") {
    const health = await openrouter.checkOpenRouterHealth();
    return { provider, ...health };
  }
  if (provider === "groq") {
    const health = await groq.checkGroqLlmHealth();
    return { provider, ...health };
  }
  const health = await ollama.checkOllamaHealth();
  return { provider, ...health };
}

async function streamChat(options) {
  const provider = activeProvider();
  if (provider === "openai") return openai.streamChat(options);
  if (provider === "openrouter") return openrouter.streamChat(options);
  if (provider === "groq") return groq.streamChat(options);
  return ollama.streamChat(options);
}

async function generateJSON(promptOrOpts) {
  const groq = require("./groqLlmProvider");
  if (groq.groqKey()) {
    const opts =
      typeof promptOrOpts === "string"
        ? { systemPrompt: "Return JSON only.", userPrompt: promptOrOpts }
        : promptOrOpts;
    return groq.generateJSON(opts);
  }
  if (activeProvider() !== "ollama") {
    throw new Error("generateJSON requires GROQ_API_KEY or LLM_PROVIDER=ollama");
  }
  const prompt = typeof promptOrOpts === "string" ? promptOrOpts : `${promptOrOpts.systemPrompt}\n\n${promptOrOpts.userPrompt}`;
  return ollama.generateJSON(prompt);
}

module.exports = { streamChat, generateJSON, checkLlmHealth, activeProvider };
