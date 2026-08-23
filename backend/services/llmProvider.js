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

function activeProvider() {
  const p = env.LLM_PROVIDER;
  if (p === "openai") return "openai";
  if (p === "openrouter") return "openrouter";
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
  const health = await ollama.checkOllamaHealth();
  return { provider, ...health };
}

async function streamChat(options) {
  const provider = activeProvider();
  if (provider === "openai") return openai.streamChat(options);
  if (provider === "openrouter") return openrouter.streamChat(options);
  return ollama.streamChat(options);
}

async function generateJSON(prompt) {
  if (activeProvider() !== "ollama") {
    throw new Error("generateJSON is only supported with LLM_PROVIDER=ollama for now");
  }
  return ollama.generateJSON(prompt);
}

module.exports = { streamChat, generateJSON, checkLlmHealth, activeProvider };
