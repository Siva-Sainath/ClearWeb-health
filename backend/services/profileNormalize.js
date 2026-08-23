"use strict";

const ZIP_RE = /^\d{5}(-\d{4})?$/;

const INSURANCE_ALIASES = {
  atna: "Aetna",
  etna: "Aetna",
  aettn: "Aetna",
  edna: "Aetna",
  aetna: "Aetna",
};

function titleCaseWords(s) {
  return s
    .split(/\s+/)
    .map((w) => (w.length <= 3 && /^[A-Z]+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

function normalizeInsurance(raw) {
  let t = String(raw || "").trim();
  if (!t) return t;
  for (const [alias, canonical] of Object.entries(INSURANCE_ALIASES)) {
    t = t.replace(new RegExp(`\\b${alias}\\b`, "gi"), canonical);
  }
  t = t.replace(/\bppo\b/gi, "PPO");
  t = t.replace(/\bhmo\b/gi, "HMO");
  return t;
}

function looksLikeCity(value) {
  const t = String(value || "").trim();
  if (!t) return false;
  if (ZIP_RE.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  return /^[A-Za-z][A-Za-z\s.'-]{1,}$/.test(t);
}

function looksLikeZip(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 5 || digits.length === 9;
}

function normalizeZipCode(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length >= 5) return digits.slice(0, 5);
  return String(raw || "").trim();
}

function normalizeSttText(text) {
  let t = String(text || "").trim();
  if (!t) return t;
  t = t.replace(/\s*[\[(]?(?:music|applause|laughter|silence)[^\])]*[\])]?\s*/gi, " ");
  t = t.replace(/\s*\(music under\)\s*/gi, " ");
  t = t.replace(/\s{2,}/g, " ").trim();

  // Light S1-mini-style cleanup (rule-based; no extra model load).
  t = t.replace(/\b(um+|uh+|er+|ah+|like,?\s+|you know,?\s+)/gi, " ");
  t = t.replace(/\s+([,.!?])/g, "$1");
  t = t.replace(/\s{2,}/g, " ").trim();
  if (t.length > 0) {
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }

  t = t.replace(/\batna\b/gi, "Aetna");
  t = t.replace(/\betna\b/gi, "Aetna");
  t = t.replace(/\baettn\b/gi, "Aetna");
  return t;
}

function normalizeProfileUpdates(updates = {}, prev = {}) {
  const out = { ...updates };

  if (out.insurance) out.insurance = normalizeInsurance(out.insurance);

  if (out.zipCode && looksLikeCity(out.zipCode) && !looksLikeZip(out.zipCode)) {
    if (!out.city && !prev.city) out.city = titleCaseWords(out.zipCode.trim());
    delete out.zipCode;
  }

  if (out.zipCode && looksLikeZip(out.zipCode)) {
    out.zipCode = normalizeZipCode(out.zipCode);
  }

  if (out.cptCode && /^787\d{2}$/.test(String(out.cptCode).trim())) {
    if (!out.zipCode && !prev.zipCode) out.zipCode = normalizeZipCode(out.cptCode);
    delete out.cptCode;
  }

  if (out.cptCode && !/^\d{5}$/.test(String(out.cptCode).trim())) {
    delete out.cptCode;
  }

  if (out.city && looksLikeZip(out.city) && !looksLikeCity(out.city)) {
    if (!out.zipCode && !prev.zipCode) out.zipCode = normalizeZipCode(out.city);
    delete out.city;
  }

  if (out.city && looksLikeCity(out.city)) {
    out.city = titleCaseWords(out.city.trim());
  }

  const junk = /^(aria|arya)$/i;
  if (out.insurance && junk.test(String(out.insurance).trim())) delete out.insurance;

  return out;
}

module.exports = {
  normalizeInsurance,
  normalizeProfileUpdates,
  normalizeSttText,
};
