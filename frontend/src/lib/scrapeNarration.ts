import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import type { PatientProfile } from "@/lib/types";

export function buildScrapeNarrationLines(
  profile: PatientProfile,
  summary: ScrapeExecutiveSummary | null
): { intro: string[]; afterReplay: string[] } {
  const proc = profile.procedure || profile.condition || "your procedure";
  const city = profile.city?.trim();
  const zip = profile.zipCode?.trim();
  const place =
    city && zip ? `${city}, ZIP ${zip}` : city || (zip ? `ZIP ${zip}` : "your area");
  const insurance = profile.insurance || "your plan";

  const intro = [
    `Searching Austin hospitals for ${proc} — ${insurance}, ${place}.`,
    "Watch the map — each line is a hospital site where Bright Data pulls the CMS price file.",
  ];

  const afterReplay: string[] = [];
  if (summary) {
    afterReplay.push(
      `Matched your procedure code to negotiated rates in each file.`,
      `${summary.pricesFound} hospitals returned prices — about $${summary.priceRange.min} to $${summary.priceRange.max}.`,
      "Opening your ranked options now.",
    );
  } else {
    afterReplay.push("Search complete — opening your ranked options.");
  }

  return { intro, afterReplay };
}

export function healNarrationLine(
  collectorId: string,
  detail?: string,
  event?: string
): string {
  const id = collectorId ? `collector ${collectorId}` : "the scraper";
  if (event === "heal_failed" || (detail && /exhaust|fail/i.test(detail))) {
    return `Self-healing was exhausted for ${id} — continuing search across remaining Austin hospitals.`;
  }
  if (detail && /unlocker/i.test(detail)) {
    return `Bright Data Web Unlocker is retrying the download for ${id}.`;
  }
  return `Self-healing is engaged on ${id} — Bright Data is repairing the scraper while you watch.`;
}

