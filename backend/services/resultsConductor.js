"use strict";

/**
 * Autonomous results walkthrough — LLM reads scraped facilities + drives UI via action tags.
 */

const { buildSystemPrompt } = require("./promptBuilder");
const { streamChat } = require("./llmProvider");
const { parseAllTags } = require("./tagParser");
const { executeUICommands } = require("./webcmdExecutor");

const CONDUCT_USER_MESSAGE = `The patient just finished a hospital price search. Give a 2-3 sentence spoken opener, then walk through the top options.

Rules:
- Be honest about data source (cached replay vs live scrape) if SCRAPE CONTEXT says so.
- Emit UI action tags on their own lines to reshape the dashboard as you explain (layout, spotlight, tab, reveal).
- Mention real prices and hospital names from SCRAPED FACILITY DATA.
- End by inviting a follow-up question.`;

function presentationHonestyBlock(mode) {
  if (mode === "live") {
    return "SCRAPE CONTEXT: Live Bright Data scrape just completed — these prices came from a real run moments ago.";
  }
  if (mode === "proof-reel" || mode === "replay") {
    return "SCRAPE CONTEXT: Verified replay — real scrape events played at 8× speed; prices are from our cached MRF database.";
  }
  if (mode === "instant") {
    return "SCRAPE CONTEXT: Instant cached snapshot — no scrape animation.";
  }
  return "SCRAPE CONTEXT: Cached hospital price database.";
}

function buildUiContext({ presentationMode, healCount, facilityCount }) {
  return `UI CONTEXT:
- presentationMode: ${presentationMode || "unknown"}
- facilityCount: ${facilityCount ?? 0}
- healEventsDuringScrape: ${healCount ?? 0}
- Start walkthrough with [action:layout:explore] then spotlight the recommended facility.`;
}

async function conductResults({
  profile,
  facilities,
  presentationMode,
  healEvents,
  executiveSummary,
}) {
  const facilityCount = facilities ? Object.keys(facilities).length : 0;
  const healCount = Array.isArray(healEvents) ? healEvents.length : 0;

  let uiContext =
    presentationHonestyBlock(presentationMode) +
    "\n" +
    buildUiContext({ presentationMode, healCount, facilityCount });

  if (executiveSummary?.recommendation?.id) {
    uiContext += `\nRecommended facility id: ${executiveSummary.recommendation.id}`;
  }

  const systemPrompt = buildSystemPrompt({
    phase: "results",
    profile,
    facilities,
    uiContext,
  });

  let fullText = "";
  await streamChat({
    systemPrompt,
    messages: [{ role: "user", content: CONDUCT_USER_MESSAGE }],
    temperature: 0.35,
    numPredict: 550,
    onToken: (token) => {
      fullText += token;
    },
  });

  const parsed = parseAllTags(fullText);
  const queued = await executeUICommands({
    actions: parsed.actions,
    navigations: parsed.navigations,
  });

  return {
    spokenScript: parsed.clean,
    fullText,
    actions: parsed.actions,
    navigations: parsed.navigations,
    queuedActions: queued,
    uiActions: parsed.actions
      .map((a) => {
        if (a.type === "compare") return `compare:${a.facilityA}:${a.facilityB}`;
        if (a.type === "reset") return "reset";
        return `${a.type}:${a.payload ?? ""}`;
      })
      .filter(Boolean),
  };
}

module.exports = { conductResults, presentationHonestyBlock };
