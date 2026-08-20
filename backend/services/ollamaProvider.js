"use strict";

const axios = require("axios");
const { env } = require("../config/env");

async function checkOllamaHealth() {
  try {
    const { data } = await axios.get(`${env.OLLAMA_BASE}/api/tags`, { timeout: 3000 });
    return { connected: true, models: data.models?.map((m) => m.name) ?? [] };
  } catch {
    return { connected: false, models: [] };
  }
}

async function streamChat({ systemPrompt, messages, onToken, temperature = 0.35, numPredict = 450 }) {
  const ollamaRes = await axios.post(
    `${env.OLLAMA_BASE}/api/chat`,
    {
      model: env.OLLAMA_MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
      options: {
        temperature,
        num_predict: numPredict,
        stop: ["\n\n\n"],
      },
    },
    { responseType: "stream", timeout: 120000 }
  );

  let fullResponse = "";

  return new Promise((resolve, reject) => {
    ollamaRes.data.on("data", (chunk) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            fullResponse += json.message.content;
            onToken?.(json.message.content);
          }
          if (json.done) resolve(fullResponse);
        } catch {
          /* skip */
        }
      }
    });
    ollamaRes.data.on("error", reject);
    ollamaRes.data.on("end", () => resolve(fullResponse));
  });
}

async function generateJSON(prompt) {
  const resp = await axios.post(`${env.OLLAMA_BASE}/api/generate`, {
    model: env.OLLAMA_MODEL,
    prompt,
    stream: false,
    format: "json",
    options: { temperature: 0.1 },
  });
  return JSON.parse(resp.data.response);
}

module.exports = { streamChat, generateJSON, checkOllamaHealth };
