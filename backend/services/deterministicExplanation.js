"use strict";

const DEFAULT_CHIPS = [
  "Show me the cheapest on a chart",
  "Compare my top two",
  "Put it on the map",
  "Help me book the top one",
  "Accredited hospitals only",
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

function facilityRevealSection(option, rank, summary) {
  const f = option.facility;
  const narrated = [
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
        ? ["layout:spotlightHero", `spotlight:${option.id}`, `show_card:${option.id}`, "tab:map"]
        : [`spotlight:${option.id}`, `show_card:${option.id}`, "layout:explore"],
  };
}

function buildDeterministicExplanation(profile, facilities, summary, events = [], scrapeContext = null) {
  const ranked = summary.ranked;
  const top = ranked[0];
  const second = ranked[1];
  const cheapest = ranked.reduce((a, b) =>
    a.facility.insurance_price < b.facility.insurance_price ? a : b
  );
  const savings = summary.priceRange.max - cheapest.facility.insurance_price;

  const cacheHits =
    scrapeContext?.stats?.cacheHits ??
    events.filter((e) => e.event === "mrf_downloaded" && e.cache_hit).length;
  const liveHits =
    scrapeContext?.stats?.liveDownloads ??
    events.filter((e) => e.event === "mrf_downloaded" && !e.cache_hit).length;
  const healCount =
    scrapeContext?.stats?.healTriggered ??
    events.filter((e) => e.event === "heal_triggered").length;
  const websiteCount =
    scrapeContext?.stats?.collectorsVisited ??
    new Set(events.map((e) => e.collector_id).filter(Boolean)).size;

  const place = locationLabel(profile, summary.location);

  const brightDataBody =
    scrapeContext?.methodSummary ||
    (cacheHits > 0 && liveHits === 0
      ? `Bright Data Scraper Studio collectors opened each hospital price-transparency portal and located the CMS machine-readable file (MRF). We loaded ${cacheHits} real MRF files from disk cache — same published hospital data, faster for the demo.`
      : `Bright Data Scraper Studio collectors navigated ${Math.max(websiteCount, summary.sourcesChecked)} hospital websites, found each MRF download link, and Web Unlocker pulled the JSON through bot protection — ${liveHits} live download(s), ${cacheHits} from cache.` +
        (healCount > 0
          ? ` When a layout broke or a site throttled us, self-healing collectors retried ${healCount} time(s).`
          : ""));

  const searchBody = `For ${summary.procedure} in ${place}, within ${summary.radiusMi} miles on ${summary.insurance}. We matched your procedure code against negotiated rates inside each MRF.`;

  const sections = [
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
      body: scrapeContext?.honestyLine
        ? `${scrapeContext.honestyLine} ${brightDataBody}`
        : brightDataBody,
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
    facilityRevealSection(top, 1, summary),
  ];

  if (second) sections.push(facilityRevealSection(second, 2, summary));

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
      body: `${summary.missed.length} hospital(s) didn't publish online prices — I've listed them in the gaps panel.`,
      emphasis: "summary",
      uiActions: ["layout:trustGaps"],
    });
  }

  return {
    spokenScript: `Here's what I found for ${summary.procedure} near ${place}. Watch the screen — I'll walk you through your best options as I go.`,
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
