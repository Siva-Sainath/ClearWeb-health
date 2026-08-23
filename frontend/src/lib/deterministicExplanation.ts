/**
 * Deterministic results walkthrough — short spoken lines, UI driven by actions.
 */

import type { ScrapeExecutiveSummary, RankedOption } from "@/lib/scrapeExecutiveSummary";
import type { FacilityResult, PatientProfile, ScraperLog } from "@/lib/types";
import type { LlmExplanation, ExplanationSection, ExplanationFacilityReveal } from "@/lib/llmExplanation";
import { CACHED_CPTS } from "@/lib/coverageFacts";
import { speechFacilityName } from "@/lib/scrapeNarration";

const DEFAULT_CHIPS = [
  "Show me the cheapest on a chart",
  "Compare my top two",
  "Put it on the map",
  "Help me book the top one",
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

function mode(values: Array<string | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = String(v || "").trim();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function pricedFacts(
  profile: PatientProfile,
  facilities: Record<string, FacilityResult>,
  summary: ScrapeExecutiveSummary
) {
  const rows = Object.values(facilities || {});
  const code = mode(rows.map((f) => f.cpt_code));
  const procedure = mode(rows.map((f) => f.procedure)) || summary.procedure;
  const asked = String(profile.cptCode || "").trim();
  return {
    code,
    procedure,
    label: code ? `${procedure} (CPT ${code})` : procedure,
    mismatch: Boolean(code && asked && asked !== code),
    askedCode: asked,
  };
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
  const savings = summary.priceRange.max - top.facility.insurance_price;

  const cacheHits = events.filter((e) => e.event === "mrf_downloaded" && e.cache_hit).length;
  const healLog = events.find((e) => e.event === "heal_triggered");

  const place = locationLabel(profile, summary.location);
  const priced = pricedFacts(profile, facilities, summary);
  const mismatchNote = priced.mismatch
    ? ` Heads-up: these rows are CPT ${priced.code}, not ${priced.askedCode}.`
    : "";

  const trustLine = healLog
    ? `Bright Data opened each hospital CMS file — ${cacheHits} from cache. Self-heal fixed ${speechFacilityName(healLog.facility_name)} when its collector broke.`
    : `Bright Data opened each hospital CMS file — ${cacheHits || "several"} cached downloads in this replay.`;

  const sections: ExplanationSection[] = [
    {
      type: "insight",
      title: "Your price range",
      body: `On ${summary.insurance}, ${priced.label} near ${place} is about $${summary.priceRange.min} to $${summary.priceRange.max}. You could save up to $${savings}.${mismatchNote}`,
      emphasis: "cost",
      uiActions: ["layout:savingsStory", "tab:range"],
    },
    {
      type: "insight",
      title: "How we collected prices",
      body: trustLine,
      emphasis: "summary",
      uiActions: ["layout:trustGaps"],
    },
    {
      type: "facility_reveal",
      facilityId: top.id,
      reasons: [
        `I recommend ${top.facility.hospital_name} at about $${top.facility.insurance_price} on ${summary.insurance}.`,
      ],
      uiActions: [
        "layout:spotlightHero",
        `spotlight:${top.id}`,
        `show_card:${top.id}`,
        ...(second ? [`compare:${top.id}:${second.id}`, "tab:compare"] : ["tab:map"]),
      ],
    } as ExplanationFacilityReveal,
    {
      type: "insight",
      title: "Explore from here",
      body: "Everything is on the map — ask me to chart the cheapest or help you book.",
      emphasis: "summary",
      uiActions: ["layout:explore", "tab:map"],
    },
  ];

  return {
    spokenScript: "",
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
