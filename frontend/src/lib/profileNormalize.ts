/**
 * Normalize STT / LLM profile fields — fix common mishears and city/ZIP mix-ups.
 */

import type { PatientProfile } from "@/lib/types";

const ZIP_RE = /^\d{5}(-\d{4})?$/;

const INSURANCE_ALIASES: Record<string, string> = {
  atna: "Aetna",
  etna: "Aetna",
  aettn: "Aetna",
  edna: "Aetna",
  aetna: "Aetna",
  bluecross: "Blue Cross",
  bcbs: "Blue Cross Blue Shield",
};

function titleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length <= 3 && /^[A-Z]+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

export function normalizeInsurance(raw: string): string {
  let t = raw.trim();
  if (!t) return t;

  const lower = t.toLowerCase();
  for (const [alias, canonical] of Object.entries(INSURANCE_ALIASES)) {
    const re = new RegExp(`\\b${alias}\\b`, "gi");
    if (re.test(lower)) {
      t = t.replace(re, canonical);
    }
  }

  // "Aetna ppo" → "Aetna PPO"
  t = t.replace(/\bppo\b/gi, "PPO");
  t = t.replace(/\bhmo\b/gi, "HMO");

  return t;
}

function looksLikeCity(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (ZIP_RE.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  return /^[A-Za-z][A-Za-z\s.'-]{1,}$/.test(t);
}

function looksLikeZip(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 5 || digits.length === 9;
}

export function normalizeZipCode(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 5) return digits.slice(0, 5);
  return raw.trim();
}

/** Fix common Whisper mishears before sending user text to the agent. */
export function normalizeUserTranscript(text: string): string {
  let t = text.trim();
  if (!t) return t;

  t = t.replace(/\batna\b/gi, "Aetna");
  t = t.replace(/\betna\b/gi, "Aetna");
  t = t.replace(/\baettn\b/gi, "Aetna");

  return t;
}

export function normalizeProfilePartial(
  partial: Partial<PatientProfile>,
  prev: PatientProfile
): Partial<PatientProfile> {
  const out: Partial<PatientProfile> = { ...partial };

  if (out.insurance?.trim()) {
    out.insurance = normalizeInsurance(out.insurance);
  }

  // City name landed in zipCode — move to city
  if (out.zipCode?.trim() && looksLikeCity(out.zipCode) && !looksLikeZip(out.zipCode)) {
    if (!out.city?.trim() && !prev.city?.trim()) {
      out.city = titleCaseWords(out.zipCode.trim());
    }
    delete out.zipCode;
  }

  if (out.zipCode?.trim() && looksLikeZip(out.zipCode)) {
    out.zipCode = normalizeZipCode(out.zipCode);
  }

  // City field accidentally got a zip
  if (out.city?.trim() && looksLikeZip(out.city) && !looksLikeCity(out.city)) {
    if (!out.zipCode?.trim() && !prev.zipCode?.trim()) {
      out.zipCode = normalizeZipCode(out.city);
    }
    delete out.city;
  }

  if (out.city?.trim() && looksLikeCity(out.city)) {
    out.city = titleCaseWords(out.city.trim());
  }

  // Don't store assistant name as profile data
  const junk = /^(aria|arya)$/i;
  if (out.insurance && junk.test(out.insurance.trim())) delete out.insurance;
  if (out.condition && junk.test(out.condition.trim())) delete out.condition;
  if (out.procedure && junk.test(out.procedure.trim())) delete out.procedure;

  return out;
}

export function normalizeProfileUpdates(
  raw: Record<string, unknown>,
  prev: PatientProfile
): Partial<PatientProfile> {
  const partial: Partial<PatientProfile> = {};
  if (typeof raw.condition === "string" && raw.condition.trim()) partial.condition = raw.condition.trim();
  if (typeof raw.procedure === "string" && raw.procedure.trim()) partial.procedure = raw.procedure.trim();
  if (typeof raw.cptCode === "string" && raw.cptCode.trim()) partial.cptCode = raw.cptCode.trim();
  if (typeof raw.insurance === "string" && raw.insurance.trim()) partial.insurance = raw.insurance.trim();
  if (typeof raw.city === "string" && raw.city.trim()) partial.city = raw.city.trim();
  if (typeof raw.zipCode === "string" && raw.zipCode.trim()) partial.zipCode = raw.zipCode.trim();
  if (raw.radiusMi != null) {
    const n = parseInt(String(raw.radiusMi), 10);
    if (n > 0) partial.radiusMi = n;
  }
  if (Array.isArray(raw.priorities)) partial.priorities = raw.priorities as PatientProfile["priorities"];
  if (typeof raw.priority === "string") {
    partial.priorities = [raw.priority as NonNullable<PatientProfile["priorities"]>[number]];
  }

  return normalizeProfilePartial(partial, prev);
}
