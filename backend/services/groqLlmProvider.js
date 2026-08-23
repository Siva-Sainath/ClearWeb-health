"use strict";

const axios = require("axios");
const { env } = require("../config/env");

const GROQ_BASE = "https://api.groq.com/openai/v1";

/** llama-3.3-70b-versatile was shut down 2026-08-16 (HTTP 404). */
const DEFAULT_GROQ_LLM = "openai/gpt-oss-120b";
const GROQ_LLM_FALLBACKS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3-32b",
];

function groqKey() {
  return String(env.GROQ_API_KEY || "").replace(/^["']|["']$/g, "").trim();
}

function preferredModel(explicit) {
  return explicit || env.GROQ_LLM_MODEL || DEFAULT_GROQ_LLM;
}

function modelQueue(explicit) {
  const first = preferredModel(explicit);
  return [...new Set([first, ...GROQ_LLM_FALLBACKS])];
}

function isMissingModel(err) {
  const status = err.response?.status;
  const msg = String(err.response?.data?.error?.message || err.message || "");
  return status === 404 || /does not exist|decommissioned|not found/i.test(msg);
}

async function postChat(body) {
  return axios.post(`${GROQ_BASE}/chat/completions`, body, {
    headers: {
      Authorization: `Bearer ${groqKey()}`,
      "Content-Type": "application/json",
    },
    timeout: 90000,
  });
}

async function withModelFallback(run) {
  if (!groqKey()) throw new Error("GROQ_API_KEY not configured");
  const models = modelQueue();
  let lastErr;
  for (const model of models) {
    try {
      return await run(model);
    } catch (err) {
      lastErr = err;
      if (!isMissingModel(err)) throw err;
      console.warn(`[groq] model ${model} unavailable (${err.response?.status || err.message}), trying next`);
    }
  }
  throw lastErr;
}

async function checkGroqLlmHealth() {
  if (!groqKey()) return { connected: false, error: "GROQ_API_KEY not set" };
  try {
    const { data } = await axios.get(`${GROQ_BASE}/models`, {
      headers: { Authorization: `Bearer ${groqKey()}` },
      timeout: 5000,
    });
    return {
      connected: true,
      models: (data.data || []).slice(0, 8).map((m) => m.id),
      model: preferredModel(),
    };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

async function streamChat({
  systemPrompt,
  messages,
  onToken,
  temperature = 0.35,
  numPredict = 450,
  model,
}) {
  const models = modelQueue(model);
  let lastErr;
  for (const m of models) {
    try {
      const res = await axios.post(
        `${GROQ_BASE}/chat/completions`,
        {
          model: m,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          stream: true,
          temperature,
          max_tokens: numPredict,
        },
        {
          headers: {
            Authorization: `Bearer ${groqKey()}`,
            "Content-Type": "application/json",
          },
          responseType: "stream",
          timeout: 60000,
        }
      );

      let fullResponse = "";
      return await new Promise((resolve, reject) => {
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
    } catch (err) {
      lastErr = err;
      if (!isMissingModel(err)) throw err;
      console.warn(`[groq] model ${m} unavailable for stream, trying next`);
    }
  }
  throw lastErr;
}

async function generateJSON({ systemPrompt, userPrompt, model }) {
  return withModelFallback(async (m) => {
    const { data } = await postChat({
      model: m,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    const text = data.choices?.[0]?.message?.content || "{}";
    return JSON.parse(text);
  });
}

async function chatWithTools({ systemPrompt, userPrompt, tools, model }) {
  return withModelFallback(async (m) => {
    const { data } = await postChat({
      model: m,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools,
      tool_choice: "auto",
      temperature: 0.25,
    });
    const msg = data.choices?.[0]?.message || {};
    const toolCalls = (msg.tool_calls || []).map((tc) => ({
      name: tc.function?.name,
      args: JSON.parse(tc.function?.arguments || "{}"),
    }));
    return { content: msg.content || "", toolCalls };
  });
}

module.exports = {
  streamChat,
  generateJSON,
  chatWithTools,
  checkGroqLlmHealth,
  groqKey,
  DEFAULT_GROQ_LLM,
};
