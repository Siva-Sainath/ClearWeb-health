"use strict";

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function numberToWords(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) return String(n);
  if (num < 20) return ONES[num];
  if (num < 100) {
    const ten = Math.floor(num / 10);
    const one = num % 10;
    return one ? `${TENS[ten]} ${ONES[one]}` : TENS[ten];
  }
  if (num < 1000) {
    const hun = Math.floor(num / 100);
    const rest = num % 100;
    return rest ? `${ONES[hun]} hundred ${numberToWords(rest)}` : `${ONES[hun]} hundred`;
  }
  return String(n);
}

function speakZip(digits) {
  return digits
    .split("")
    .map((d) => (d === "0" ? "oh" : ONES[Number(d)] || d))
    .join(" ");
}

/** Rewrite text so TTS says "fifty miles" not "5 0 dash m i l e". */
function normalizeForSpeech(text) {
  if (!text) return text;
  let out = String(text);

  out = out.replace(/\b(\d{1,3})\s*[-–—]\s*(miles?|mi)\b/gi, (_, n, unit) => {
    const u = String(unit).toLowerCase();
    if (u === "miles") return `${numberToWords(n)} miles`;
    return `${numberToWords(n)} mile`;
  });
  out = out.replace(/\b(\d{1,3})\s+(miles?|mi)\b/gi, (_, n, unit) => {
    const u = String(unit).toLowerCase();
    if (u === "mi" || u === "mile") return `${numberToWords(n)} mile`;
    return `${numberToWords(n)} miles`;
  });
  out = out.replace(/\b(\d{1,3})\s*[-–—]\s*digit\b/gi, (_, n) => `${numberToWords(n)} digit`);
  out = out.replace(/\b(\d{1,3})\s+digit\b/gi, (_, n) => `${numberToWords(n)} digit`);

  // Any remaining "12-word" compound (10-minute, 3-hour) — drop the dash.
  out = out.replace(/\b(\d{1,3})\s*[-–—]\s*([A-Za-z]+)\b/g, (_, n, word) => `${numberToWords(n)} ${word}`);

  out = out.replace(/\b(\d{5})(?:-(\d{4}))?\b/g, (_, zip, plus4) => {
    const main = speakZip(zip);
    return plus4 ? `${main}, ${speakZip(plus4)}` : main;
  });

  return out.replace(/\s{2,}/g, " ").trim();
}

module.exports = { normalizeForSpeech, numberToWords };
