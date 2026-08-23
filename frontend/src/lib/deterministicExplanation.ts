/**
 * Deterministic LLM-style explanation from scraped/cached facility data.
 * No Ollama or Groq required — this is the walkthrough the demo always plays.
 */

import type { ScrapeExecutiveSummary, RankedOption } from "@/lib/scrapeExecutiveSummary";
import type { FacilityResult, PatientProfile, ScraperLog } from "@/lib/types";
import type { LlmExplanation, ExplanationSection, ExplanationFacilityReveal } from "@/lib/llmExplanation";
import { CACHED_CPTS } from "@/lib/coverageFacts";
import { speechFacilityName } from "@/lib/scrapeNarration";
import { ST_LUKES_HEAL_SHOWCASE } from "@/lib/healShowcase";

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

function mode(values: Array<string | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = String(v || "").trim();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * The dollars on screen belong to whatever CPT the cached rows carry. Report that
 * code, and flag it when it is not the procedure the patient asked for.
 */
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
    known: Boolean(code && (CACHED_CPTS as readonly string[]).includes(code)),
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
  const cheapest = ranked.reduce((a, b) =>
    a.facility.insurance_price < b.facility.insurance_price ? a : b
  );
  const savings = summary.priceRange.max - cheapest.facility.insurance_price;

  const cacheHits = events.filter((e) => e.event === "mrf_downloaded" && e.cache_hit).length;
  const liveHits = events.filter((e) => e.event === "mrf_downloaded" && !e.cache_hit).length;
  const healLogs = events.filter((e) => e.event === "heal_triggered");

  const place = locationLabel(profile, summary.location);
  const priced = pricedFacts(profile, facilities, summary);
  const procedureLabel = priced.label;
  const mismatchNote = priced.mismatch
    ? ` One honest caveat: the rows we have cached near you are ${priced.procedure}, CPT ${priced.code} — not CPT ${priced.askedCode}. These dollars are that code, not a stand-in for it.`
    : "";

  function facilityReveal(
    option: RankedOption,
    uiActions: string[],
    lead: string
  ): ExplanationFacilityReveal {
    const f = option.facility;
    const narrated: string[] = [
      `${lead} ${f.hospital_name} — about $${f.insurance_price} on ${summary.insurance} for ${priced.procedure}.`,
    ];
    if (option.badge) narrated.push(option.badge);
    const extra = option.reasons.filter((r) => !r.startsWith("$")).slice(0, 1);
    if (extra.length) narrated.push(extra[0]);

    return {
      type: "facility_reveal",
      facilityId: option.id,
      reasons: narrated,
      uiActions,
    };
  }

  // Step 2 body: how collection actually worked, then the self-heal beat.
  const collectionSentences: string[] = [];
  collectionSentences.push(
    cacheHits > 0 && liveHits === 0
      ? `Bright Data collectors opened each hospital's price-transparency site and found its CMS machine-readable file. We replayed ${cacheHits} real cached downloads instead of re-scraping live, so nothing here is invented.`
      : `Bright Data collectors opened each hospital's price-transparency site, and Web Unlocker pulled the CMS files — ${liveHits} live download${liveHits === 1 ? "" : "s"} and ${cacheHits} from cache.`
  );

  const healFacility = healLogs.length
    ? speechFacilityName(healLogs[0].facility_name)
    : null;
  if (healFacility) {
    collectionSentences.push(
      `${healFacility} broke the collector mid-run, and Bright Data self-healing repaired it on its own — no code change from us.`
    );
  }
  collectionSentences.push(
    `You can also watch the full recorded self-heal cycle we captured on ${speechFacilityName(
      ST_LUKES_HEAL_SHOWCASE.facility.name
    )} in ${ST_LUKES_HEAL_SHOWCASE.facility.city} — that one is a separate recording, not one of your ${place} prices.`
  );

  const sections: ExplanationSection[] = [
    {
      type: "insight",
      title: "Your price range",
      body: `For ${procedureLabel} near ${place} on ${summary.insurance}, you're looking at about $${summary.priceRange.min} to $${summary.priceRange.max}. Choosing well could save you up to $${savings}.${mismatchNote}`,
      emphasis: "cost",
      uiActions: ["layout:savingsStory", "tab:range"],
    },
    {
      type: "insight",
      title: "How we collected prices",
      body: collectionSentences.join(" "),
      emphasis: "summary",
      uiActions: ["layout:trustGaps"],
    },
  ];

  sections.push(
    facilityReveal(
      top,
      ["layout:spotlightHero", `spotlight:${top.id}`, `show_card:${top.id}`],
      "My recommendation is"
    )
  );

  if (second) {
    sections.push(
      facilityReveal(
        second,
        [
          "layout:compareSplit",
          `compare:${top.id}:${second.id}`,
          "tab:compare",
          `show_card:${second.id}`,
        ],
        "Side by side with it,"
      )
    );
  }

  if (cheapest.id !== top.id) {
    sections.push({
      type: "insight",
      title: "Cheapest option",
      body: `${cheapest.facility.hospital_name} is the lowest at about $${cheapest.facility.insurance_price} — same procedure, just a different hospital's negotiated rate.`,
      emphasis: "cost",
      uiActions: [
        "layout:chartFocus",
        "tab:scatter",
        "filter:cheap",
        `spotlight:${cheapest.id}`,
      ],
    });
  }

  const gapNote = summary.missed.length
    ? `${summary.missed.length} hospital${summary.missed.length > 1 ? "s" : ""} never published a usable rate, so they're in the gaps panel rather than these numbers. `
    : "";

  sections.push({
    type: "insight",
    title: "Explore from here",
    body: `${gapNote}Everything on your screen now is on the map. Ask me to chart the cheapest, compare any two, or help you book — I'll move the dashboard for you.`,
    emphasis: "summary",
    uiActions: ["layout:explore", "tab:map"],
  });

  const spokenScript = `Here's what we found for ${procedureLabel} near ${place}. Watch the screen — I'll walk you through it.`;

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
