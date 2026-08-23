#!/usr/bin/env node
/**
 * ox-subagent — delegate a focused task to OpenRouter stealth/ox-alpha in parallel.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-... node scripts/ox-subagent.mjs "Summarize heal.py approval gate"
 *   node scripts/ox-subagent.mjs --json "Return JSON: list files in scraper/pipeline"
 *
 * Cursor agent: spawn multiple instances in parallel for faster exploration.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  for (const rel of ["backend/.env", ".env"]) {
    const p = resolve(ROOT, rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf-8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

loadEnv();

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || "stealth/ox-alpha";
const jsonMode = process.argv.includes("--json");
const prompt = process.argv.filter((a) => a !== "--json").slice(2).join(" ").trim();

if (!API_KEY) {
  console.error("Set OPENROUTER_API_KEY in backend/.env or the environment.");
  process.exit(1);
}
if (!prompt) {
  console.error("Usage: node scripts/ox-subagent.mjs [--json] \"your task\"");
  process.exit(1);
}

const system = jsonMode
  ? "You are a fast coding subagent. Reply with valid JSON only, no markdown fences."
  : "You are a fast coding subagent. Be concise and actionable. Focus only on the task given.";

const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost:3000",
    "X-Title": "Clearweb Health Subagent",
  },
  body: JSON.stringify({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    stream: true,
    temperature: 0.2,
    max_tokens: 2048,
  }),
});

if (!res.ok) {
  console.error(await res.text());
  process.exit(1);
}

let full = "";
const reader = res.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value, { stream: true });
  for (const line of chunk.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (payload === "[DONE]") continue;
    try {
      const json = JSON.parse(payload);
      const text = json.choices?.[0]?.delta?.content;
      if (text) {
        full += text;
        process.stdout.write(text);
      }
      if (json.usage?.completion_tokens_details?.reasoning_tokens != null) {
        process.stderr.write(
          `\n[ox] reasoning_tokens=${json.usage.completion_tokens_details.reasoning_tokens}\n`
        );
      }
    } catch {
      /* partial */
    }
  }
}

process.stdout.write("\n");
