/** Spoken care → CPT so onboarding is not Brain-MRI-only. */

const PROCEDURE_CPT: Array<{ re: RegExp; cpt: string; label: string }> = [
  { re: /\b(brain|head)\s+mri\b|\bmri\s+(?:of\s+(?:the\s+)?)?(brain|head)\b/i, cpt: "70553", label: "Brain MRI" },
  { re: /\b(knee)\s+mri\b|\bmri\s+(?:of\s+(?:the\s+)?)?knee\b/i, cpt: "73721", label: "Knee MRI" },
  { re: /\b(shoulder)\s+mri\b|\bmri\s+(?:of\s+(?:the\s+)?)?shoulder\b/i, cpt: "73221", label: "Shoulder MRI" },
  { re: /\b(lumbar|spine|back|lower\s+back)\s+mri\b|\bmri\s+(?:of\s+(?:the\s+)?)?(lumbar|spine|back)\b/i, cpt: "72148", label: "Lumbar MRI" },
  { re: /\bmri\b/i, cpt: "70553", label: "MRI" },
  { re: /\b(ct|cat)\s+scan\b|\bct\s+of\b/i, cpt: "74177", label: "CT scan" },
  { re: /\bcolonoscopy\b/i, cpt: "45378", label: "Colonoscopy" },
  { re: /\b(er|emergency(?:\s+room)?)\b/i, cpt: "99284", label: "Emergency room visit" },
  { re: /\bknee\s+replacement\b|\btotal\s+knee\b/i, cpt: "27447", label: "Knee replacement" },
  { re: /\bhip\s+replacement\b|\btotal\s+hip\b/i, cpt: "27130", label: "Hip replacement" },
  { re: /\bmammogram\b/i, cpt: "77067", label: "Mammogram" },
  { re: /\bendoscopy\b|\begd\b/i, cpt: "43235", label: "Endoscopy" },
  { re: /\b(blood\s+(?:test|work)|cbc|labs?)\b/i, cpt: "80053", label: "Blood test" },
  { re: /\bx[\s-]?ray\b/i, cpt: "71046", label: "X-ray" },
];

export function inferProcedureCpt(text: string): { cpt: string; label: string | null } | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  if (/^\d{5}$/.test(raw)) return { cpt: raw, label: null };
  for (const row of PROCEDURE_CPT) {
    if (row.re.test(raw)) return { cpt: row.cpt, label: row.label };
  }
  const digits = raw.match(/\b(\d{5})\b/);
  if (digits) return { cpt: digits[1], label: null };
  return null;
}

export function austinCacheMismatchBanner(
  askedProcedure: string,
  askedCpt: string,
  cachedProcedure?: string,
  cachedCpt?: string
): string | null {
  const asked = (askedProcedure || "").trim();
  const cacheProc = (cachedProcedure || "").trim();
  const cacheCpt = (cachedCpt || "").trim();
  const wantCpt = (askedCpt || "").trim();
  if (!asked && !wantCpt) return null;
  if (wantCpt && cacheCpt && wantCpt === cacheCpt) return null;

  const askedL = asked.toLowerCase();
  const cacheL = cacheProc.toLowerCase();
  if (askedL && cacheL && askedL === cacheL) return null;

  const askedEr = /er\b|emergency/.test(askedL) || wantCpt.startsWith("9928");
  const cacheEr = /er\b|emergency/.test(cacheL) || cacheCpt.startsWith("9928");
  if (askedEr && cacheEr) return null;

  if (!cacheCpt && !cacheProc) return null;

  return `You asked for ${asked || "this procedure"}${wantCpt ? ` (CPT ${wantCpt})` : ""}. These dollar amounts are Austin demo-cache prices for ${cacheProc || "the cached code"}${cacheCpt ? ` (CPT ${cacheCpt})` : ""} — not a live match for a different CPT.`;
}
