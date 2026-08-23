"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const { execFileSync } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const wavefile = require("wavefile");
const { env } = require("../config/env");

const STT_PRESETS = {
  fast: "Xenova/whisper-tiny.en",
  balanced: "Xenova/whisper-small.en",
  accurate: "Xenova/whisper-base.en",
};

const STT_PRESET = process.env.STT_PRESET || "fast";
const WHISPER_MODEL =
  process.env.WHISPER_MODEL || STT_PRESETS[STT_PRESET] || STT_PRESETS.fast;

function resolveSttProvider() {
  const configured = (process.env.STT_PROVIDER || "auto").toLowerCase();
  if (configured === "groq") return env.GROQ_API_KEY ? "groq" : "local";
  if (configured === "local") return "local";
  return env.GROQ_API_KEY ? "groq" : "local";
}

const STT_PROVIDER = resolveSttProvider();

let transcriberPromise = null;
let activeModel = null;

async function getTranscriber() {
  if (!transcriberPromise || activeModel !== WHISPER_MODEL) {
    activeModel = WHISPER_MODEL;
    transcriberPromise = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      return pipeline("automatic-speech-recognition", WHISPER_MODEL);
    })();
  }
  return transcriberPromise;
}

function readWavAsFloat32(wavPath) {
  const buffer = fs.readFileSync(wavPath);
  const wav = new wavefile.WaveFile(buffer);
  wav.toBitDepth("32f");
  wav.toSampleRate(16000);
  const samples = wav.getSamples(false, Float32Array);
  return samples instanceof Float32Array ? samples : Float32Array.from(samples);
}

function measurePeak(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
  }
  return peak;
}

function convertToWav(inputPath, outputPath) {
  if (!ffmpegPath) throw new Error("ffmpeg not available for audio conversion");
  execFileSync(
    ffmpegPath,
    ["-y", "-i", inputPath, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", outputPath],
    { stdio: "pipe" }
  );
}

const { normalizeSttText } = require("./profileNormalize");
const { normalizeWithS1Mini, checkS1MiniHealth } = require("./s1MiniNormalizer");

const HALLUCINATION_RE =
  /^(thank you\.?|thanks for watching\.?|subscribe\.?|you\.?|\*?fades out\*?\.?|\.|\s)+$/i;

function cleanTranscript(text) {
  const t = normalizeSttText(text.trim());
  if (!t || HALLUCINATION_RE.test(t)) return "";
  return t;
}

async function transcribeWithGroq(wavPath) {
  const form = new FormData();
  form.append("file", fs.createReadStream(wavPath), {
    filename: "audio.wav",
    contentType: "audio/wav",
  });
  form.append("model", process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo");
  form.append("language", "en");
  form.append("response_format", "json");

  const { data } = await axios.post(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      timeout: 30000,
      maxBodyLength: Infinity,
    }
  );
  return data?.text ?? "";
}

async function transcribeWithLocal(wavPath) {
  const audioData = readWavAsFloat32(wavPath);
  const durationSec = audioData.length / 16000;
  const transcriber = await getTranscriber();
  const result = await transcriber(audioData, {
    language: "english",
    task: "transcribe",
    ...(durationSec > 25
      ? { chunk_length_s: 30, stride_length_s: 5 }
      : { chunk_length_s: Math.min(30, Math.ceil(durationSec) + 2) }),
  });
  return result?.text ?? "";
}

async function checkSttHealth() {
  const s1mini = await checkS1MiniHealth();
  if (STT_PROVIDER === "groq") {
    return {
      available: Boolean(env.GROQ_API_KEY),
      model: process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo",
      preset: "groq",
      engine: "groq-cloud",
      s1mini,
      reason: env.GROQ_API_KEY ? null : "GROQ_API_KEY not set",
    };
  }
  try {
    await getTranscriber();
    return {
      available: true,
      model: WHISPER_MODEL,
      preset: STT_PRESET,
      engine: "whisper-local",
      s1mini,
      reason: null,
    };
  } catch (err) {
    return {
      available: false,
      model: WHISPER_MODEL,
      preset: STT_PRESET,
      engine: "whisper-local",
      s1mini,
      reason: err.message,
    };
  }
}

async function transcribeAudio(buffer, filename = "recording.webm") {
  if (!buffer?.length) throw new Error("Empty audio recording");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clearweb-stt-"));
  const inputPath = path.join(tmpDir, filename);
  const wavPath = path.join(tmpDir, "audio.wav");

  try {
    fs.writeFileSync(inputPath, buffer);
    if (buffer.length < 2000) {
      throw new Error("Recording too short — speak for at least 2 seconds.");
    }

    convertToWav(inputPath, wavPath);

    if (fs.statSync(wavPath).size < 3000) {
      throw new Error("No audio captured — check mic permissions and try again.");
    }

    const peak = measurePeak(readWavAsFloat32(wavPath));
    if (peak < 0.002) {
      throw new Error("Microphone level too low — move closer or use the keyboard.");
    }

    let raw =
      STT_PROVIDER === "groq"
        ? await transcribeWithGroq(wavPath)
        : await transcribeWithLocal(wavPath);

    let text = cleanTranscript(raw);
    if (text && env.S1_MINI_ENABLED) {
      text = await normalizeWithS1Mini(text);
      text = cleanTranscript(text);
    }
    if (!text) {
      throw new Error("Couldn't understand that — try speaking for 2–3 seconds.");
    }
    return text;
  } catch (err) {
    throw new Error(err.message || "Transcription failed");
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

module.exports = { transcribeAudio, checkSttHealth, STT_PRESETS };
