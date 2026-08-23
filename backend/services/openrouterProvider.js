"use strict";

const axios = require("axios");
const { env } = require("../config/env");

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function headers() {
  return {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": env.OPENROUTER_REFERER || env.FRONTEND_URL || "http://localhost:3000",
    "X-Title": env.OPENROUTER_APP_TITLE || "Clearweb Health",
  };
}

async function checkOpenRouterHealth() {
  if (!env.OPENROUTER_API_KEY) {
    return { connected: false, models: [], error: "OPENROUTER_API_KEY not set" };
  }
  try {
    const { data } = await axios.get(`${OPENROUTER_BASE}/models`, {
      headers: headers(),
      timeout: 8000,
    });
    const ids = (data.data || []).map((m) => m.id);
    const hasOx = ids.some((id) => id.includes("ox-alpha"));
    return {
      connected: true,
      models: ids.slice(0, 8),
      model: env.OPENROUTER_MODEL,
      oxAlphaAvailable: hasOx,
    };
  } catch (err) {
    return { connected: false, models: [], error: err.message };
  }
}

async function streamChat({ systemPrompt, messages, onToken, temperature = 0.35, numPredict = 450 }) {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  const res = await axios.post(
    `${OPENROUTER_BASE}/chat/completions`,
    {
      model: env.OPENROUTER_MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
      temperature,
      max_tokens: numPredict,
    },
    {
      headers: headers(),
      responseType: "stream",
      timeout: 120000,
    }
  );

  let fullResponse = "";

  return new Promise((resolve, reject) => {
    res.data.on("data", (chunk) => {
      const lines = chunk.toString().split("\n").filter((line) => line.startsWith("data: "));
      for (const line of lines) {
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") {
          resolve(fullResponse);
          return;
        }
        try {
          const json = JSON.parse(payload);
          const token = json.choices?.[0]?.delta?.content;
          if (token) {
            fullResponse += token;
            onToken?.(token);
          }
        } catch {
          /* skip partial SSE chunks */
        }
      }
    });
    res.data.on("error", reject);
    res.data.on("end", () => resolve(fullResponse));
  });
}

module.exports = { streamChat, checkOpenRouterHealth };
