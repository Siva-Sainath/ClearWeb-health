import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import type { PatientProfile } from "@/lib/types";
import { normalizeScrapeEvent } from "@/lib/scrapeEventNormalize";

/** Long MRF facility strings read badly aloud (and "Baylor St. Luke's" sounds like Baylor). */
export function speechFacilityName(raw?: string): string {
  const name = String(raw || "").trim();
  if (!name) return "that hospital";
  if (/st\.?\s*luke/i.test(name)) return "St. Luke's";
  if (/baylor scott\s*&?\s*white/i.test(name)) return "Baylor Scott and White";
  if (/st\.?\s*david/i.test(name)) return "St. David's";
  if (/ascension|dell seton|seton/i.test(name)) return "Ascension Seton";
  if (/christus|santa rosa/i.test(name)) return "CHRISTUS Santa Rosa";
  if (/encompass/i.test(name)) return "Encompass Health";
  if (/shriners/i.test(name)) return "Shriners Children's";
  if (/westlake/i.test(name)) return "Westlake Medical Center";
  if (/austin oaks/i.test(name)) return "Austin Oaks Hospital";
  return name.split(/\s+[-–—]\s+/)[0];
}

function placeLabel(profile: PatientProfile): string {
  const city = profile.city?.trim();
  const zip = profile.zipCode?.trim();
  if (city && zip) return `${city}, ZIP ${zip}`;
  if (city) return city;
  if (zip) return `ZIP ${zip}`;
  return "your Austin ZIP";
}

export function buildScrapeNarrationLines(
  profile: PatientProfile,
  summary: ScrapeExecutiveSummary | null,
  options: { isLive?: boolean } = {}
): { intro: string[]; afterReplay: string[] } {
  const proc = summary?.procedure?.trim() || profile.procedure || profile.condition || "your procedure";
  const place = placeLabel(profile);
  const insurance = summary?.insurance?.trim() || profile.insurance || "your plan";

  if (options.isLive) {
    return {
      intro: [
        `Running a live Bright Data scrape for ${proc} near ${place} on ${insurance}.`,
        "Each spoke on the map is a hospital price-transparency site we're opening right now.",
      ],
      afterReplay: summary
        ? [
            `${summary.pricesFound} hospitals returned published rates — about $${summary.priceRange.min} to $${summary.priceRange.max}. Let me walk you through them.`,
          ]
        : ["Scrape complete. Let me walk you through what came back."],
    };
  }

  const intro = [
    `This is a recorded Bright Data scrape replay, not a live run. We already pulled the CMS price files for ${proc} near ${place} on ${insurance}.`,
    "Watch the map — each spoke is a hospital site we captured, replayed at eight times speed.",
  ];

  const afterReplay = summary
    ? [
        `That capture returned published rates from ${summary.pricesFound} hospitals — roughly $${summary.priceRange.min} to $${summary.priceRange.max}. Let me walk you through them, including exactly which code those dollars came from.`,
      ]
    : ["That's the full capture. Let me walk you through what we found."];

  return { intro, afterReplay };
}

export type ScrapePhaseKey = "collectors" | "unlocker" | "extract" | "gap";

export interface ScrapePhaseLine {
  key: ScrapePhaseKey;
  line: string;
}

/**
 * One line per pipeline phase — never per hospital, so the reel doesn't
 * repeat the same health system on every event.
 */
export function phaseNarrationFromLog(
  log: { event?: string; cache_hit?: boolean },
  context: { procedure?: string; isLive?: boolean } = {}
): ScrapePhaseLine | null {
  const past = !context.isLive;

  switch (normalizeScrapeEvent(log.event)) {
    case "collector_started":
    case "page_loaded":
      return {
        key: "collectors",
        line: past
          ? "Bright Data Scraper Studio had already opened each hospital's price-transparency page and found its CMS machine-readable file."
          : "Bright Data Scraper Studio is opening each hospital's price-transparency page to find its CMS file.",
      };
    case "mrf_downloaded":
      return {
        key: "unlocker",
        line: past
          ? "Web Unlocker had downloaded those files through the sites' bot protection — we're replaying the saved copies."
          : "Web Unlocker is downloading those files through the sites' bot protection.",
      };
    case "price_extracted":
      return {
        key: "extract",
        line: past
          ? `Inside each file we matched your request against that hospital's published rates — I'll name the exact code on the results screen.`
          : `We're matching your request against each hospital's published rates.`,
      };
    case "extraction_failed":
    case "rate_limited":
      return {
        key: "gap",
        line: past
          ? "A few hospitals never published a usable rate, so we logged them as gaps instead of guessing."
          : "Some hospitals aren't publishing a usable rate — we log those as gaps instead of guessing.",
      };
    default:
      return null;
  }
}

const PHASE_SAMPLE_EVENTS = [
  { event: "collector_started" },
  { event: "mrf_downloaded" },
  { event: "price_extracted" },
  { event: "extraction_failed" },
];

/** Every line the reel could speak, so Edge audio is cached before playback. */
export function allPhaseLines(context: { procedure?: string; isLive?: boolean } = {}): string[] {
  return PHASE_SAMPLE_EVENTS.map((log) => phaseNarrationFromLog(log, context)?.line).filter(
    (line): line is string => Boolean(line)
  );
}

export function healNarrationLine(
  collectorId: string,
  detail?: string,
  event?: string,
  facilityName?: string,
  options: { isLive?: boolean } = {}
): string {
  const where = facilityName ? speechFacilityName(facilityName) : "one hospital site";
  const id = collectorId ? ` Collector ${collectorId}` : " The collector";
  const ev = normalizeScrapeEvent(event);
  const past = !options.isLive;

  if (ev === "heal_failed" || (detail && /exhaust|fail/i.test(detail))) {
    return past
      ? `Here's the honest part — the scraper broke on ${where} and self-healing couldn't recover it, so we left it out rather than invent a price.`
      : `The scraper broke on ${where} and self-healing couldn't recover it, so we're leaving it out.`;
  }
  if (detail && /unlocker/i.test(detail)) {
    return past
      ? `${where} blocked the download, so Bright Data Web Unlocker retried it and got the file.`
      : `${where} is blocking the download, so Web Unlocker is retrying.`;
  }
  return past
    ? `Watch this moment — ${where} changed its page layout and broke the scraper.${id} repaired itself through Bright Data self-healing, with no code change from us.`
    : `${where} just broke the scraper.${id} is repairing itself through Bright Data self-healing.`;
}
