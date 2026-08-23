"use strict";

const axios = require("axios");
const { env } = require("../config/env");

const GROQ_BASE = "https://api.groq.com/openai/v1";

function groqKey() {
  return env.GROQ_API_KEY || "";
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
      model: env.GROQ_LLM_MODEL || "llama-3.3-70b-versatile",
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
  if (!groqKey()) throw new Error("GROQ_API_KEY not configured");
  const m = model || env.GROQ_LLM_MODEL || "llama-3.3-70b-versatile";
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

async function generateJSON({ systemPrompt, userPrompt, model }) {
  if (!groqKey()) throw new Error("GROQ_API_KEY not configured");
  const m = model || env.GROQ_LLM_MODEL || "llama-3.3-70b-versatile";
  const { data } = await axios.post(
    `${GROQ_BASE}/chat/completions`,
    {
      model: m,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    },
    {
      headers: {
        Authorization: `Bearer ${groqKey()}`,
        "Content-Type": "application/json",
      },
      timeout: 90000,
    }
  );
  const text = data.choices?.[0]?.message?.content || "{}";
  return JSON.parse(text);
}

/**
 * OpenAI-compatible tool calling (Groq). Returns assistant message + tool_calls.
 */
async function chatWithTools({ systemPrompt, userPrompt, tools, model }) {
  if (!groqKey()) throw new Error("GROQ_API_KEY not configured");
  const m = model || env.GROQ_LLM_MODEL || "llama-3.3-70b-versatile";
  const { data } = await axios.post(
    `${GROQ_BASE}/chat/completions`,
    {
      model: m,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools,
      tool_choice: "auto",
      temperature: 0.25,
    },
    {
      headers: {
        Authorization: `Bearer ${groqKey()}`,
        "Content-Type": "application/json",
      },
      timeout: 90000,
    }
  );
  const msg = data.choices?.[0]?.message || {};
  const toolCalls = (msg.tool_calls || []).map((tc) => ({
    name: tc.function?.name,
    args: JSON.parse(tc.function?.arguments || "{}"),
  }));
  return { content: msg.content || "", toolCalls };
}

module.exports = { streamChat, generateJSON, chatWithTools, checkGroqLlmHealth, groqKey };
