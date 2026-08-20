/**
 * Onboarding — only apply profile fields the user actually said (or corrections to existing).
 * Stops the model from pre-filling insurance / radius from prompt examples.
 */

import type { PatientProfile } from "@/lib/types";

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

function userSupportsInsurance(text: string): boolean {
  return /\baetna\b|\batna\b|\betna\b|\baettn\b|\bblue cross\b|\bbcbs\b|\bcigna\b|\bunited\b|\bhumana\b|\binsurance\b|\bmy plan\b/.test(
    text
  );
}

function userSupportsCity(text: string, city: string): boolean {
  const c = norm(city);
  if (!c) return false;
  if (text.includes(c)) return true;
  return /\baustin\b|\bdallas\b|\bhouston\b|\bsan antonio\b/.test(text) && c.length > 2;
}

function userSupportsZip(text: string): boolean {
  return /\b\d{5}\b/.test(text);
}

function userSupportsRadius(text: string): boolean {
  return /\b\d+\s*miles?\b|\bradius\b|\bhow far\b|\bdriving\b|\bwithin\b|\b25\b|\b50\b|\b100\b/.test(
    text
  );
}

function userSupportsProcedure(text: string): boolean {
  return /\ber\b|\bemergency\b|\bvisit\b|\bmri\b|\bcolonoscopy\b|\bprocedure\b|\bpriced\b|\bcost\b|\bbill\b/.test(
    text
  );
}

function userSupportsPriority(text: string): boolean {
  return /\bcost\b|\bcheapest\b|\bdistance\b|\bclose\b|\baccredit\b|\bwait\b|\bpriorit/.test(
    text
  );
}

/**
 * Filter profile partial to fields justified by user messages (or corrections).
 */
export function gateOnboardingProfileUpdates(
  partial: Partial<PatientProfile>,
  prev: PatientProfile,
  userMessage: string,
  history?: { role: string; content: string }[]
): Partial<PatientProfile> {
  const allUser = history ? userTexts(history) : norm(userMessage);
  const latest = norm(userMessage);
  const combined = `${allUser} ${latest}`;
  const out: Partial<PatientProfile> = {};

  const getPrev = (field: keyof PatientProfile): string => {
    if (field === "radiusMi") return prev.radiusMi > 0 ? String(prev.radiusMi) : "";
    if (field === "priorities") return (prev.priorities?.length ?? 0) > 0 ? "yes" : "";
    const v = prev[field];
    return typeof v === "string" ? v : "";
  };

  const allow = (field: keyof PatientProfile, supported: boolean, value: unknown) => {
    const already = Boolean(getPrev(field).trim());

    if (supported || already) {
      if (field === "radiusMi" && typeof value === "number" && value > 0) {
        out.radiusMi = value;
      } else if (field === "priorities" && Array.isArray(value)) {
        out.priorities = value as PatientProfile["priorities"];
      } else if (typeof value === "string" && value.trim()) {
        (out as Record<string, string>)[field] = value.trim();
      }
    }
  };

  if (partial.procedure?.trim()) {
    allow("procedure", userSupportsProcedure(combined), partial.procedure);
  }
  if (partial.condition?.trim()) {
    allow("condition", userSupportsProcedure(combined), partial.condition);
  }
  if (partial.cptCode?.trim()) {
    allow("cptCode", userSupportsProcedure(combined), partial.cptCode);
  }
  if (partial.insurance?.trim()) {
    allow("insurance", userSupportsInsurance(combined), partial.insurance);
  }
  if (partial.city?.trim()) {
    allow("city", userSupportsCity(combined, partial.city), partial.city);
  }
  if (partial.zipCode?.trim()) {
    allow("zipCode", userSupportsZip(combined), partial.zipCode);
  }
  if (partial.radiusMi != null && partial.radiusMi > 0) {
    allow("radiusMi", userSupportsRadius(combined), partial.radiusMi);
  }
  if (partial.priorities?.length) {
    allow("priorities", userSupportsPriority(combined), partial.priorities);
  }

  return out;
}
