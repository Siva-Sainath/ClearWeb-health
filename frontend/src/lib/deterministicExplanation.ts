/**
 * Deterministic LLM-style explanation from scraped/cached facility data.
 * No Ollama required — reliable for demos with disk-cached MRF results.
 */

import type { ScrapeExecutiveSummary, RankedOption } from "@/lib/scrapeExecutiveSummary";
import type { FacilityResult, PatientProfile, ScraperLog } from "@/lib/types";
import type { LlmExplanation, ExplanationSection, ExplanationFacilityReveal } from "@/lib/llmExplanation";

const DEFAULT_CHIPS = [
  "Show me the cheapest on a chart",
  "Compare my top two",
  "Put it on the map",
  "Help me book the top one",
  "Accredited hospitals only",
  "What didn't work?",
];

function locationLabel(profile: PatientProfile, fallback: string): string {
  const city = profile.city?.trim();
  const zip = profile.zipCode?.trim();
  if (city && zip) return `${city}, ${zip}`;
  if (city) return city;
  if (zip) return `ZIP ${zip}`;
  return fallback;
}

export function buildDeterministicExplanation(
  profile: PatientProfile,
  facilities: Record<string, FacilityResult>,
  summary: ScrapeExecutiveSummary,
  events: ScraperLog[] = []
): LlmExplanation {
  const ranked = summary.ranked;
  const top = ranked[0];
  const second = ranked[1];
  const cheapest = ranked.reduce((a, b) =>
    a.facility.insurance_price < b.facility.insurance_price ? a : b
  );
  const savings = summary.priceRange.max - cheapest.facility.insurance_price;

  const cacheHits = events.filter((e) => e.event === "mrf_downloaded" && e.cache_hit).length;
  const liveHits = events.filter((e) => e.event === "mrf_downloaded" && !e.cache_hit).length;
  const healCount = events.filter((e) => e.event === "heal_triggered").length;
  const websiteCount = new Set(
    events.map((e) => e.collector_id).filter(Boolean)
  ).size;

  const place = locationLabel(profile, summary.location);

  function facilityRevealSection(option: RankedOption, rank: number): ExplanationFacilityReveal {
    const f = option.facility;
    const narrated: string[] = [
      `On your screen now — ${f.hospital_name}, rank #${rank}, about $${f.insurance_price} on ${summary.insurance}.`,
    ];
    if (option.badge) narrated.push(option.badge);
    const extra = option.reasons.filter((r) => !r.startsWith("$")).slice(0, 1);
    if (extra.length) narrated.push(extra[0]);

    return {
      type: "facility_reveal",
      facilityId: option.id,
      reasons: narrated,
      uiActions:
        rank === 1
          ? [
              "layout:spotlightHero",
              `spotlight:${option.id}`,
              `show_card:${option.id}`,
              "tab:map",
            ]
          : [`spotlight:${option.id}`, `show_card:${option.id}`, "layout:explore"],
    };
  }

  const brightDataBody =
    cacheHits > 0 && liveHits === 0
      ? `Bright Data Scraper Studio collectors opened each hospital price-transparency portal and located the CMS machine-readable file (MRF). We loaded ${cacheHits} real MRF files from disk cache — same published hospital data, faster for the demo.`
      : `Bright Data Scraper Studio collectors navigated ${Math.max(websiteCount, summary.sourcesChecked)} hospital websites, found each MRF download link, and Web Unlocker pulled the JSON through bot protection — ${liveHits} live download${liveHits === 1 ? "" : "s"}, ${cacheHits} from cache.` +
        (healCount > 0
          ? ` When a layout broke or a site throttled us, self-healing collectors retried ${healCount} time${healCount === 1 ? "" : "s"}.`
          : "");

  const searchBody = `For ${summary.procedure} in ${place}, within ${summary.radiusMi} miles on ${summary.insurance}. We matched your procedure code against negotiated rates inside each MRF.`;

  const sections: ExplanationSection[] = [
    {
      type: "insight",
      title: "Your price range",
      body: `On ${summary.insurance}, you're looking at about $${summary.priceRange.min} to $${summary.priceRange.max}. Picking a lower-cost hospital could save you up to $${savings}.`,
      emphasis: "cost",
      uiActions: ["layout:savingsStory", "tab:range"],
    },
    {
      type: "insight",
      title: "How we collected prices",
      body: brightDataBody,
      emphasis: "summary",
      uiActions: ["layout:trustGaps"],
    },
    {
      type: "insight",
      title: "What we searched",
      body: searchBody,
      emphasis: "summary",
      uiActions: ["layout:explore", "tab:map"],
    },
  ];

  const topReveal = facilityRevealSection(top, 1);
  sections.push(topReveal);

  if (second) {
    sections.push(facilityRevealSection(second, 2));
  }

  if (cheapest.id !== top.id) {
    sections.push({
      type: "insight",
      title: "Cheapest option",
      body: `${cheapest.facility.hospital_name} is the lowest at about $${cheapest.facility.insurance_price} — ask me to put it on a chart anytime.`,
      emphasis: "cost",
      uiActions: [
        "layout:chartFocus",
        "tab:scatter",
        "filter:cheap",
        `spotlight:${cheapest.id}`,
      ],
    });
  }

  if (summary.missed.length > 0) {
    sections.push({
      type: "insight",
      title: "Sites without public prices",
      body: `${summary.missed.length} hospital${summary.missed.length > 1 ? "s" : ""} didn't publish online prices — I've listed them in the gaps panel.`,
      emphasis: "summary",
      uiActions: ["layout:trustGaps"],
    });
  }

  const spokenScript = `Here's what I found for ${summary.procedure} near ${place}. Watch the screen — I'll walk you through your best options as I go.`;

  return {
    spokenScript,
    sections,
    layout: "explore",
    defaultLayout: "explore",
    uiActions: ["layout:explore", `spotlight:${top.id}`, "tab:map"],
    ranked: ranked.map((r) => r.id),
    recommendation: top.id,
    reasoning: summary.bullets.join(" "),
    savings,
    tags: { [top.id]: top.badge ?? "Top pick" },
    suggestedFollowUps: DEFAULT_CHIPS,
  };
}
