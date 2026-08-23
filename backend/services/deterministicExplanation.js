"use strict";

const DEFAULT_CHIPS = [
  "Show me the cheapest on a chart",
  "Compare my top two",
  "Put it on the map",
  "Help me book the top one",
  "What didn't work?",
];

function locationLabel(profile, fallback) {
  const city = profile.city?.trim();
  const zip = profile.zipCode?.trim();
  if (city && zip) return `${city}, ${zip}`;
  if (city) return city;
  if (zip) return `ZIP ${zip}`;
  return fallback;
}

function speechFacilityName(raw) {
  const name = String(raw || "").trim();
  if (!name) return "that hospital";
  if (/st\.?\s*luke/i.test(name)) return "St. Luke's";
  return name.split(/\s+[-–—]\s+/)[0];
}

function mode(values) {
  const counts = new Map();
  for (const v of values) {
    const key = String(v || "").trim();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function pricedFacts(profile, facilities, summary) {
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

function buildDeterministicExplanation(profile, facilities, summary, events = [], scrapeContext = null) {
  const ranked = summary.ranked;
  const top = ranked[0];
  const second = ranked[1];
  const savings = summary.priceRange.max - top.facility.insurance_price;

  const cacheHits =
    scrapeContext?.stats?.cacheHits ??
    events.filter((e) => e.event === "mrf_downloaded" && e.cache_hit).length;
  const healLog = events.find((e) => e.event === "heal_triggered");

  const place = locationLabel(profile, summary.location);
  const priced = pricedFacts(profile, facilities, summary);
  const mismatchNote = priced.mismatch
    ? ` Heads-up: these rows are CPT ${priced.code}, not ${priced.askedCode}.`
    : "";

  const trustLine = healLog
    ? `Bright Data opened each hospital CMS file — ${cacheHits} from cache. Self-heal fixed ${speechFacilityName(healLog.facility_name)} when its collector broke.`
    : `Bright Data opened each hospital CMS file — ${cacheHits || "several"} cached downloads in this replay.`;

  const sections = [
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
      body: scrapeContext?.honestyLine ? `${scrapeContext.honestyLine} ${trustLine}` : trustLine,
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
    },
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

module.exports = { buildDeterministicExplanation };
