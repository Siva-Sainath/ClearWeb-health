"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const wavefile = require("wavefile");

/** Better accuracy than tiny; still runs locally */
const WHISPER_MODEL = process.env.WHISPER_MODEL || "Xenova/whisper-base.en";

let transcriberPromise = null;

async function getTranscriber() {
  if (!transcriberPromise) {
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
  if (!ffmpegPath) {
    throw new Error("ffmpeg not available for audio conversion");
  }
  execFileSync(
    ffmpegPath,
    [
      "-y",
      "-i",
      inputPath,
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      outputPath,
    ],
    { stdio: "pipe" }
  );
}

async function checkSttHealth() {
  try {
    await getTranscriber();
    return {
      available: true,
      model: WHISPER_MODEL,
      engine: "transformers-local",
      reason: null,
    };
  } catch (err) {
    return {
      available: false,
      model: WHISPER_MODEL,
      engine: "transformers-local",
      reason: err.message,
    };
  }
}

const HALLUCINATION_RE =
  /^(thank you\.?|thanks for watching\.?|subscribe\.?|you\.?|\*?fades out\*?\.?|\.|\s)+$/i;

const { normalizeSttText } = require("./profileNormalize");

function cleanTranscript(text) {
  const t = normalizeSttText(text.trim());
  if (!t || HALLUCINATION_RE.test(t)) return "";
  return t;
}

async function transcribeAudio(buffer, filename = "recording.webm") {
  if (!buffer?.length) {
    throw new Error("Empty audio recording");
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clearweb-stt-"));
  const inputPath = path.join(tmpDir, filename);
  const wavPath = path.join(tmpDir, "audio.wav");

  try {
    fs.writeFileSync(inputPath, buffer);

    if (buffer.length < 2000) {
      throw new Error("Recording too short — speak for at least 2 seconds.");
    }

    convertToWav(inputPath, wavPath);

    const wavStat = fs.statSync(wavPath);
    if (wavStat.size < 3000) {
      throw new Error("No audio captured — check mic permissions and try again.");
    }

    const audioData = readWavAsFloat32(wavPath);
    const peak = measurePeak(audioData);

    if (peak < 0.002) {
      throw new Error(
        "Microphone level too low — move closer, check input device, or use the keyboard."
      );
    }

    const transcriber = await getTranscriber();
    const result = await transcriber(audioData, {
      language: "english",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const text = cleanTranscript(result?.text ?? "");
    if (!text) {
      throw new Error(
        "Couldn't understand that — try speaking closer to the mic for 2–3 seconds, or use the keyboard."
      );
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

module.exports = { transcribeAudio, checkSttHealth };
