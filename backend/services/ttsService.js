"use strict";

const { EdgeTTS } = require("edge-tts-universal");
const { env } = require("../config/env");
const { stripTags } = require("./tagParser");
const { normalizeForSpeech } = require("./speechNormalize");

const GROQ_SPEECH_URL = "https://api.groq.com/openai/v1/audio/speech";

function mimeFromBuffer(buf) {
  if (!buf?.length) return "audio/mpeg";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    return "audio/wav";
  }
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) {
    return "audio/ogg";
  }
  return "audio/mpeg";
}

function groqVoice(requested) {
  if (requested && !/neural|en-US-|en-GB-/i.test(requested)) return requested;
  return env.GROQ_TTS_VOICE;
}

async function synthesizeWithGroq(text, options = {}) {
  if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");

  const res = await fetch(GROQ_SPEECH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.GROQ_TTS_MODEL,
      voice: groqVoice(options.voice),
      input: text,
      response_format: "wav",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq TTS ${res.status}: ${detail.slice(0, 240)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function synthesizeWithEdge(text, options = {}) {
  const voice = options.voice && /Neural/i.test(options.voice) ? options.voice : env.TTS_VOICE;
  const rate = options.rate || env.TTS_RATE;
  const pitch = options.pitch || env.TTS_PITCH;
  const tts = new EdgeTTS(text, voice, { rate, pitch });
  const result = await tts.synthesize();
  const arrayBuffer = await result.audio.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function resolveProvider() {
  const configured = (env.TTS_PROVIDER || "auto").toLowerCase();
  if (configured === "groq") return env.GROQ_API_KEY ? "groq" : "edge";
  if (configured === "edge") return "edge";
  return env.GROQ_API_KEY ? "groq" : "edge";
}

const audioCache = new Map();

async function synthesizeSpeech(text, options = {}) {
  const clean = normalizeForSpeech(stripTags(text));
  if (!clean) return { buffer: Buffer.alloc(0), mime: "audio/mpeg", provider: "none" };

  const cacheId = `${resolveProvider()}|${groqVoice(options.voice)}|${clean}`;
  const hit = audioCache.get(cacheId);
  if (hit) return hit;

  const provider = resolveProvider();
  let result;
  try {
    if (provider === "groq") {
      const buffer = await synthesizeWithGroq(clean, options);
      result = { buffer, mime: mimeFromBuffer(buffer), provider: "groq" };
    } else {
      const buffer = await synthesizeWithEdge(clean, options);
      result = { buffer, mime: mimeFromBuffer(buffer), provider: "edge" };
    }
  } catch (err) {
    if (provider === "groq") {
      console.warn("[tts] Groq failed, falling back to Edge:", err.message);
      if (/terms acceptance/i.test(err.message)) {
        console.warn(
          "[tts] Accept Orpheus terms: https://console.groq.com/playground?model=canopylabs/orpheus-v1-english"
        );
      }
      const buffer = await synthesizeWithEdge(clean, options);
      result = { buffer, mime: mimeFromBuffer(buffer), provider: "edge-fallback" };
    } else {
      throw err;
    }
  }

  if (result.buffer.length) audioCache.set(cacheId, result);
  return result;
}

async function warmupTts(texts) {
  for (const text of texts) {
    try {
      const { provider, buffer } = await synthesizeSpeech(text);
      console.log(`[tts] warmup ${provider} (${buffer.length} bytes)`);
    } catch (err) {
      console.warn("[tts] warmup skipped:", err.message);
    }
  }
}

async function checkTtsHealth() {
  const provider = resolveProvider();
  try {
    if (provider === "groq") {
      return {
        available: true,
        provider: "groq",
        model: env.GROQ_TTS_MODEL,
        voice: env.GROQ_TTS_VOICE,
      };
    }
    const { buffer } = await synthesizeSpeech("ok.");
    return {
      available: buffer.length > 0,
      provider,
      voice: env.TTS_VOICE,
    };
  } catch (err) {
    return {
      available: false,
      provider,
      voice: env.TTS_VOICE,
      error: err.message,
    };
  }
}

module.exports = { synthesizeSpeech, checkTtsHealth, resolveProvider, warmupTts };
