import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import type { PatientProfile } from "@/lib/types";
import { normalizeScrapeEvent } from "@/lib/scrapeEventNormalize";

export function buildScrapeNarrationLines(
  profile: PatientProfile,
  summary: ScrapeExecutiveSummary | null
): { intro: string[]; afterReplay: string[] } {
  const proc = profile.procedure || profile.condition || "your procedure";
  const city = profile.city?.trim();
  const zip = profile.zipCode?.trim();
  const place =
    city && zip ? `${city}, ZIP ${zip}` : city || (zip ? `ZIP ${zip}` : "your Austin ZIP");
  const insurance = profile.insurance || "your plan";

  const intro = [
    `Searching hospitals near ${place} for ${proc} on ${insurance}.`,
    "Watch the map — each spoke is a hospital website. Bright Data opens the CMS price file, then we match your procedure inside it.",
  ];

  const afterReplay: string[] = [];
  if (summary) {
    afterReplay.push(
      `Matched ${proc} to the negotiated rates in each hospital file.`,
      `${summary.pricesFound} hospitals returned prices — about $${summary.priceRange.min} to $${summary.priceRange.max}.`,
      "Opening your ranked options now.",
    );
  } else {
    afterReplay.push("Search complete — opening your ranked options.");
  }

  return { intro, afterReplay };
}

export function processNarrationFromLog(log: {
  event?: string;
  facility_name?: string;
  hospital_name?: string;
  cache_hit?: boolean;
  cpt_code?: string;
}): string | null {
  const name = log.facility_name || log.hospital_name || "this hospital";
  switch (normalizeScrapeEvent(log.event)) {
    case "collector_started":
      return `Opening ${name}'s price-transparency page through Bright Data.`;
    case "page_loaded":
      return `Found the CMS machine-readable file link at ${name}.`;
    case "mrf_downloaded":
      return log.cache_hit
        ? `Loading the cached CMS price file for ${name}.`
        : `Downloading the live CMS price file for ${name} through Web Unlocker.`;
    case "price_extracted":
      return `Matching ${name}'s published rates to your procedure.`;
    case "extraction_failed":
      return `${name} didn't publish a usable rate — moving to the next hospital.`;
    default:
      return null;
  }
}

export function healNarrationLine(
  collectorId: string,
  detail?: string,
  event?: string
): string {
  const id = collectorId ? `collector ${collectorId}` : "the scraper";
  const ev = normalizeScrapeEvent(event);
  if (ev === "heal_failed" || (detail && /exhaust|fail/i.test(detail))) {
    return `Self-healing was exhausted for ${id} — continuing search across remaining Austin hospitals.`;
  }
  if (detail && /unlocker/i.test(detail)) {
    return `Bright Data Web Unlocker is retrying the download for ${id}.`;
  }
  return `Self-healing is engaged on ${id} — Bright Data is repairing the scraper while you watch.`;
}
