/**
 * Deterministic follow-up matcher — maps voice/text questions to UI choreography.
 * Used before LLM for reliable demo behavior with cached results.
 */

import type { UIAction, LayoutMode } from "@/lib/uiActions";
import type { ScrapeExecutiveSummary } from "@/lib/scrapeExecutiveSummary";
import type { FacilityResult } from "@/lib/types";

export interface FollowUpContext {
  summary: ScrapeExecutiveSummary;
  facilities: Record<string, FacilityResult>;
  visibleIds: string[];
}

export interface FollowUpResult {
  speech: string;
  actions: UIAction[];
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function topTwo(ctx: FollowUpContext): [string, string] | null {
  const ids = ctx.summary.ranked.map((r) => r.id);
  if (ids.length < 2) return null;
  return [ids[0], ids[1]];
}

function cheapestId(ctx: FollowUpContext): string {
  return ctx.summary.ranked.reduce((a, b) =>
    a.facility.insurance_price < b.facility.insurance_price ? a : b
  ).id;
}

function topId(ctx: FollowUpContext): string {
  return ctx.summary.ranked[0]?.id ?? Object.keys(ctx.facilities)[0];
}

const RULES: Array<{
  test: (t: string) => boolean;
  resolve: (ctx: FollowUpContext) => FollowUpResult | null;
}> = [
  {
    test: (t) =>
      /cheapest|lowest price|show.*chart|price chart|scatter|on a chart/.test(t) && !/compare/.test(t),
    resolve: (ctx) => {
      const id = cheapestId(ctx);
      const f = ctx.facilities[id];
      const price = f?.insurance_price;
      return {
        speech: price
          ? `Here's the cheapest on the chart — ${f.hospital_name} at about $${price}.`
          : `Highlighting the lowest price on the chart for you.`,
        actions: [
          { type: "layout", payload: "chartFocus" },
          { type: "tab", payload: "scatter" },
          { type: "filter", payload: "cheap" },
          { type: "sort", payload: "price" },
          { type: "spotlight", payload: id },
        ],
      };
    },
  },
  {
    test: (t) => /compare.*top|top two|versus|vs\b|side by side|compare my/.test(t),
    resolve: (ctx) => {
      const pair = topTwo(ctx);
      if (!pair) {
        return {
          speech: "I only found one option in range — let me show you everything we have.",
          actions: [
            { type: "filter", payload: "none" },
            { type: "layout", payload: "explore" },
            { type: "tab", payload: "map" },
          ],
        };
      }
      const [a, b] = pair;
      const fa = ctx.facilities[a];
      const fb = ctx.facilities[b];
      return {
        speech: `Side by side — ${fa?.hospital_name} at about $${fa?.insurance_price}, and ${fb?.hospital_name} at about $${fb?.insurance_price}.`,
        actions: [
          { type: "layout", payload: "compareSplit" },
          { type: "compare", facilityA: a, facilityB: b },
          { type: "tab", payload: "compare" },
        ],
      };
    },
  },
  {
    test: (t) => /map|on a map|show.*map|directions|how far|drive|route|put it on/.test(t),
    resolve: (ctx) => {
      const id = topId(ctx);
      const f = ctx.facilities[id];
      return {
        speech: f?.distance_mi
          ? `On the map — ${f.hospital_name} is about ${f.distance_mi} miles from you.`
          : `Here's the map with your top pick highlighted.`,
        actions: [
          { type: "layout", payload: "mapRoute" },
          { type: "route", payload: id },
          { type: "tab", payload: "map" },
          { type: "spotlight", payload: id },
        ],
      };
    },
  },
  {
    test: (t) => /book|schedule|appointment|help me book/.test(t),
    resolve: (ctx) => {
      const id = topId(ctx);
      const f = ctx.facilities[id];
      const actions: UIAction[] = [
        { type: "layout", payload: "spotlightHero" },
        { type: "spotlight", payload: id },
        { type: "show_card", payload: id },
      ];
      if (f?.bookingUrl) actions.push({ type: "book", payload: id });
      return {
        speech: f?.bookingUrl
          ? `Opening booking for ${f.hospital_name} — you can finish scheduling on their site.`
          : `${f?.hospital_name ?? "Your top pick"} doesn't have online booking, but I've pulled up their card — call scheduling to set it up.`,
        actions,
      };
    },
  },
  {
    test: (t) => /accredited|certified hospital|accredited only|accredited hospitals/.test(t),
    resolve: (ctx) => ({
      speech: "Filtering to accredited hospitals only — sorted by price so you see the best deals first.",
      actions: [
        { type: "filter", payload: "accredited" },
        { type: "tab", payload: "range" },
        { type: "sort", payload: "price" },
        { type: "layout", payload: "explore" },
      ],
    }),
  },
  {
    test: (t) => /distance|closest|nearest|sort.*distance|how far/.test(t) && !/map|route/.test(t),
    resolve: (ctx) => {
      const nearest = ctx.summary.ranked.reduce((a, b) =>
        (a.facility.drive_min ?? a.facility.distance_mi) <
        (b.facility.drive_min ?? b.facility.distance_mi)
          ? a
          : b
      );
      return {
        speech: `Closest to you is ${nearest.facility.hospital_name} — about ${nearest.facility.distance_mi} miles away.`,
        actions: [
          { type: "sort", payload: "distance" },
          { type: "tab", payload: "scatter" },
          { type: "spotlight", payload: nearest.id },
        ],
      };
    },
  },
  {
    test: (t) => /spread|how much.*save|save money|savings|expensive|could i save/.test(t),
    resolve: (ctx) => ({
      speech: `Prices run from about $${ctx.summary.priceRange.min} to $${ctx.summary.priceRange.max} — here's how much you could save by picking a lower-cost hospital.`,
      actions: [
        { type: "layout", payload: "savingsStory" },
        { type: "tab", payload: "range" },
      ],
    }),
  },
  {
    test: (t) => /fail|missing|gap|what.*wrong|didn't find|didn t work|no price|what didn/.test(t),
    resolve: (ctx) => {
      const n = ctx.summary.missed.length + ctx.summary.partialIssues.length;
      return {
        speech:
          n > 0
            ? `A few hospitals didn't publish prices online — I'm showing you exactly which ones and why.`
            : "Good news — every hospital we checked had pricing. No big gaps this time.",
        actions: [{ type: "layout", payload: "trustGaps" }],
      };
    },
  },
  {
    test: (t) => /under \$?\d+|cheap filter|under 500|budget|lower cost/.test(t),
    resolve: (ctx) => ({
      speech: "Filtering to the lower-cost options — check the chart for who's under your range.",
      actions: [
        { type: "filter", payload: "cheap" },
        { type: "tab", payload: "scatter" },
        { type: "layout", payload: "chartFocus" },
      ],
    }),
  },
  {
    test: (t) => /rating|best rated|quality|stars|best reviews/.test(t),
    resolve: (ctx) => {
      const best = ctx.summary.ranked.reduce((a, b) =>
        a.facility.rating > b.facility.rating ? a : b
      );
      return {
        speech: `${best.facility.hospital_name} has the highest rating here — ${best.facility.rating} stars.`,
        actions: [
          { type: "sort", payload: "rating" },
          { type: "spotlight", payload: best.id },
          { type: "layout", payload: "spotlightHero" },
        ],
      };
    },
  },
  {
    test: (t) => /call.*cheap|dial|phone|call the cheapest/.test(t),
    resolve: (ctx) => {
      const id = cheapestId(ctx);
      const f = ctx.facilities[id];
      return {
        speech: `I'll dial ${f?.phoneDepartment ?? "scheduling"} at ${f?.hospital_name ?? "the cheapest option"}.`,
        actions: [
          { type: "call", payload: id },
          { type: "show_card", payload: id },
          { type: "spotlight", payload: id },
        ],
      };
    },
  },
  {
    test: (t) => /reset|clear|start over|default view|show me everything/.test(t),
    resolve: () => ({
      speech: "Okay — back to the full list. All your options are showing again.",
      actions: [{ type: "reset" }, { type: "layout", payload: "explore" }],
    }),
  },
  {
    test: (t) => /explain.*top|tell me about.*top|why.*recommend|walk me through|again/.test(t),
    resolve: (ctx) => {
      const id = topId(ctx);
      const top = ctx.summary.ranked[0];
      const reason = top.reasons[0] ?? "solid price for your plan";
      return {
        speech: `My top pick is ${top.facility.hospital_name} at about $${top.facility.insurance_price} — ${reason}.`,
        actions: [
          { type: "layout", payload: "spotlightHero" },
          { type: "reveal", payload: id },
          { type: "spotlight", payload: id },
          { type: "show_card", payload: id },
        ],
      };
    },
  },
  {
    test: (t) => /tradeoff|price vs distance|distance trade|price versus/.test(t),
    resolve: () => ({
      speech: "This chart shows price versus distance — farther bubbles usually cost more, but not always.",
      actions: [
        { type: "layout", payload: "chartFocus" },
        { type: "tab", payload: "scatter" },
      ],
    }),
  },
];

/** Human chip labels → phrases the matcher understands */
const CHIP_QUERY_MAP: Record<string, string> = {
  "Show me the cheapest on a chart": "show me the cheapest on a chart",
  "Compare my top two": "compare my top two",
  "Put it on the map": "put it on the map",
  "Help me book the top one": "help me book the top one",
  "Accredited hospitals only": "accredited hospitals only",
  "What didn't work?": "what didn't work",
};

export function matchFollowUpIntent(text: string, ctx: FollowUpContext): FollowUpResult | null {
  const t = norm(chipLabelToQuery(text));
  if (!t) return null;
  for (const rule of RULES) {
    if (rule.test(t)) return rule.resolve(ctx);
  }
  return null;
}

export function chipLabelToQuery(label: string): string {
  return CHIP_QUERY_MAP[label] ?? label;
}
