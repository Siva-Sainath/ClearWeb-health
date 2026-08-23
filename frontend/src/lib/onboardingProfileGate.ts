/**
 * Onboarding profile gate — reject LLM placeholders; trust user speech tokens.
 */

import type { PatientProfile } from "@/lib/types";
import { isLikelyCptCode } from "@/lib/scrapeEventNormalize";

const PLACEHOLDER_VALUES = new Set([
  "value",
  "example",
  "unknown",
  "n/a",
  "na",
  "procedure",
  "condition",
  "insurance",
  "city",
  "zip",
  "zipcode",
]);

export function isPlaceholderProfileValue(value: unknown): boolean {
  const v = norm(String(value ?? ""));
  if (!v || v.length < 2) return true;
  return PLACEHOLDER_VALUES.has(v);
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function userTexts(messages: { role: string; content: string }[]): string {
  return norm(
    messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ")
  );
}

function valueMentioned(text: string, value: string): boolean {
  const v = norm(value);
  if (!v) return false;
  if (text.includes(v)) return true;
  if (v.length <= 4) {
    return new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);
  }
  return false;
}

function sharesTokensWithUser(text: string, value: string): boolean {
  const tokens = norm(value)
    .split(" ")
    .filter((t) => t.length > 2 && !PLACEHOLDER_VALUES.has(t));
  if (!tokens.length) return false;
  const hits = tokens.filter((t) => text.includes(t));
  return hits.length >= Math.max(1, Math.ceil(tokens.length * 0.5));
}

function fieldSupported(text: string, field: keyof PatientProfile, value: unknown): boolean {
  if (isPlaceholderProfileValue(value)) return false;
  if (typeof value === "string" && valueMentioned(text, value)) return true;
  if (typeof value === "number" && field === "radiusMi") {
    return text.includes(String(value)) || /\b\d+\s*miles?\b/.test(text);
  }

  switch (field) {
    case "insurance":
    case "city":
    case "procedure":
    case "condition":
      return typeof value === "string" && sharesTokensWithUser(text, value);
    case "cptCode":
      return isLikelyCptCode(String(value));
    case "zipCode":
      return /\b\d{5}\b/.test(text);
    case "radiusMi":
      return /\b\d+\s*miles?\b|\bradius\b|\bwithin\b/.test(text);
    case "priorities":
      return /\bcost\b|\bcheapest\b|\bdistance\b|\bclose\b|\baccredit\b|\bwait\b/.test(text);
    default:
      return false;
  }
}

export function gateOnboardingProfileUpdates(
  partial: Partial<PatientProfile>,
  prev: PatientProfile,
  userMessage: string,
  history?: { role: string; content: string }[]
): Partial<PatientProfile> {
  const allUser = history ? userTexts(history) : norm(userMessage);
  const latest = norm(userMessage);
  const combined = `${allUser} ${latest}`.trim();
  const out: Partial<PatientProfile> = {};

  const allow = (field: keyof PatientProfile, value: unknown) => {
    if (isPlaceholderProfileValue(value)) return;
    const supported = fieldSupported(combined, field, value);
    if (!supported) return;

    if (field === "radiusMi" && typeof value === "number" && value > 0) {
      out.radiusMi = value;
    } else if (field === "priorities" && Array.isArray(value)) {
      out.priorities = value as PatientProfile["priorities"];
    } else if (typeof value === "string" && value.trim()) {
      (out as Record<string, string>)[field] = value.trim();
    }
  };

  if (partial.procedure?.trim()) allow("procedure", partial.procedure);
  if (partial.condition?.trim()) allow("condition", partial.condition);
  if (partial.cptCode?.trim()) allow("cptCode", partial.cptCode);
  if (partial.insurance?.trim()) allow("insurance", partial.insurance);
  if (partial.city?.trim()) allow("city", partial.city);
  if (partial.zipCode?.trim()) allow("zipCode", partial.zipCode);
  if (partial.radiusMi != null && partial.radiusMi > 0) allow("radiusMi", partial.radiusMi);
  if (partial.priorities?.length) allow("priorities", partial.priorities);

  return out;
}
