"use strict";

const { EdgeTTS } = require("edge-tts-universal");
const { env } = require("../config/env");
const { stripTags } = require("./tagParser");

async function synthesizeSpeech(text, options = {}) {
  const clean = stripTags(text);
  if (!clean) return Buffer.alloc(0);

  const voice = options.voice || env.TTS_VOICE;
  const rate = options.rate || env.TTS_RATE;
  const pitch = options.pitch || env.TTS_PITCH;

  const tts = new EdgeTTS(clean, voice, { rate, pitch });
  const result = await tts.synthesize();
  const arrayBuffer = await result.audio.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function checkTtsHealth() {
  try {
    const buf = await synthesizeSpeech("Clearweb Health voice check.");
    return { available: buf.length > 0, voice: env.TTS_VOICE };
  } catch (err) {
    return { available: false, voice: env.TTS_VOICE, error: err.message };
  }
}

module.exports = { synthesizeSpeech, checkTtsHealth };
