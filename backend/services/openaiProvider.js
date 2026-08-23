"use strict";

const axios = require("axios");
const { env } = require("../config/env");

async function checkOpenAIHealth() {
  if (!env.OPENAI_API_KEY) {
    return { connected: false, models: [], error: "OPENAI_API_KEY not set" };
  }
  try {
    const { data } = await axios.get(`${env.OPENAI_BASE}/models`, {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      timeout: 5000,
    });
    return {
      connected: true,
      models: (data.data || []).slice(0, 5).map((m) => m.id),
      model: env.OPENAI_MODEL,
    };
  } catch (err) {
    return { connected: false, models: [], error: err.message };
  }
}

async function streamChat({ systemPrompt, messages, onToken, temperature = 0.35, numPredict = 450 }) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const ollamaRes = await axios.post(
    `${env.OPENAI_BASE}/chat/completions`,
    {
      model: env.OPENAI_MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
      temperature,
      max_tokens: numPredict,
    },
    {
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      responseType: "stream",
      timeout: 120000,
    }
  );

  let fullResponse = "";

  return new Promise((resolve, reject) => {
    ollamaRes.data.on("data", (chunk) => {
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
    ollamaRes.data.on("error", reject);
    ollamaRes.data.on("end", () => resolve(fullResponse));
  });
}

module.exports = { streamChat, checkOpenAIHealth };
