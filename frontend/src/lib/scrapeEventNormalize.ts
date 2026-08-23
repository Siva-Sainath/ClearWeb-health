/** Austin demo ZIPs (787xx) must never be stored or searched as CPT codes. */

export function isAustinZip(code: string): boolean {
  return /^787\d{2}$/.test(String(code || "").trim());
}

export function isLikelyCptCode(code: string): boolean {
  const c = String(code || "").trim();
  if (!/^\d{5}$/.test(c)) return false;
  if (isAustinZip(c)) return false;
  return true;
}

const EVENT_ALIASES: Record<string, string> = {
  page_loaded: "page_loaded",
  mrf_downloaded: "mrf_downloaded",
  price_extracted: "price_extracted",
  collector_started: "collector_started",
  extraction_failed: "extraction_failed",
  rate_limited: "rate_limited",
  heal_triggered: "heal_triggered",
  heal_resumed: "heal_resumed",
  heal_failed: "heal_failed",
};

export function normalizeScrapeEvent(raw?: string | null): string {
  const key = String(raw || "").trim();
  return EVENT_ALIASES[key] || key;
}
