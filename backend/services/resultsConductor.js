"use strict";

/**
 * Results presentation — OpenAI-style tool calling (Groq) or structured JSON (Ollama).
 * Returns a staggered step plan; the browser orchestrator applies UI with delays.
 */

const { buildSystemPrompt } = require("./promptBuilder");
const { streamChat } = require("./llmProvider");
const { parseAllTags } = require("./tagParser");
const { executeUICommands } = require("./webcmdExecutor");
const { generateJSON: ollamaJson } = require("./ollamaProvider");
const { generateJSON: groqJson, chatWithTools, groqKey } = require("./groqLlmProvider");
const {
  UI_PRESENTATION_TOOLS,
  PRESENTATION_JSON_SCHEMA,
  toolCallToUiAction,
  stepsToUiActions,
} = require("./uiToolSchema");

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
- Start walkthrough with set_layout explore, then spotlight the recommended facility.`;
}

function stepActions(tool, args) {
  const mapped = toolCallToUiAction(tool, args);
  if (!mapped) return [];
  return Array.isArray(mapped) ? mapped : [mapped];
}

function enrichSteps(steps) {
  return (steps || []).map((step, i) => ({
    tool: step.tool,
    args: step.args || {},
    delayMs: typeof step.delayMs === "number" ? step.delayMs : 700 + i * 450,
    caption: step.caption || "",
    actions: step.actions?.length ? step.actions : stepActions(step.tool, step.args),
  }));
}

async function generatePresentationPlan({ profile, facilities, presentationMode, executiveSummary }) {
  const facilityIds = Object.keys(facilities || {});
  const rec = executiveSummary?.recommendation?.id || facilityIds[0] || "n1";

  const systemPrompt = `${buildSystemPrompt({
    phase: "results",
    profile,
    facilities,
    uiContext: presentationHonestyBlock(presentationMode),
  })}

You plan an interactive UI walkthrough. ${PRESENTATION_JSON_SCHEMA}`;

  const userPrompt = `Plan a dynamic presentation for the patient. Recommended facility id: ${rec}.
Available facility ids: ${facilityIds.join(", ")}.
Procedure: ${profile?.procedure || profile?.condition || "care"}. Insurance: ${profile?.insurance || "unknown"}.
Include honest mention of data source in spokenScript.`;

  if (groqKey()) {
    try {
      const { content, toolCalls } = await chatWithTools({
        systemPrompt,
        userPrompt,
        tools: UI_PRESENTATION_TOOLS,
      });
      if (toolCalls.length) {
        const steps = toolCalls.map((tc, i) => ({
          tool: tc.name,
          args: tc.args,
          delayMs: 650 + i * 420,
          caption: "",
        }));
        return {
          spokenScript:
            content?.trim() ||
            "Here are your hospital options based on real price transparency files.",
          steps: enrichSteps(steps),
          source: "groq_tools",
        };
      }
      const plan = await groqJson({ systemPrompt, userPrompt });
      return { ...plan, steps: enrichSteps(plan.steps), source: "groq_json" };
    } catch (err) {
      console.warn("[conductResults] Groq plan failed, falling back:", err.message);
    }
  }

  const plan = await ollamaJson(`${systemPrompt}\n\n${userPrompt}`);
  return { ...plan, steps: enrichSteps(plan.steps), source: "ollama_json" };
}

/** Tool-based staggered plan (preferred). */
async function conductResults({
  profile,
  facilities,
  presentationMode,
  healEvents,
  executiveSummary,
  queueWebcmd = false,
}) {
  const facilityCount = facilities ? Object.keys(facilities).length : 0;
  const healCount = Array.isArray(healEvents) ? healEvents.length : 0;

  try {
    const plan = await generatePresentationPlan({
      profile,
      facilities,
      presentationMode,
      executiveSummary,
    });
    const steps = plan.steps || [];
    const allActions = stepsToUiActions(steps);

    if (queueWebcmd && allActions.length) {
      await executeUICommands({ actions: allActions, navigations: [] });
    }

    return {
      spokenScript: plan.spokenScript || "",
      steps,
      actions: allActions,
      source: plan.source || "plan",
      uiActions: allActions
        .map((a) => {
          if (a.type === "compare") return `compare:${a.facilityA}:${a.facilityB}`;
          if (a.type === "reset") return "reset";
          return `${a.type}:${a.payload ?? ""}`;
        })
        .filter(Boolean),
      presentationMode,
      healCount,
      facilityCount,
    };
  } catch (planErr) {
    console.warn("[conductResults] Plan failed, tag stream fallback:", planErr.message);
  }

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
  if (queueWebcmd) {
    await executeUICommands({
      actions: parsed.actions,
      navigations: parsed.navigations,
    });
  }

  return {
    spokenScript: parsed.clean,
    fullText,
    steps: [],
    actions: parsed.actions,
    navigations: parsed.navigations,
    source: "tag_stream",
    uiActions: parsed.actions
      .map((a) => {
        if (a.type === "compare") return `compare:${a.facilityA}:${a.facilityB}`;
        if (a.type === "reset") return "reset";
        return `${a.type}:${a.payload ?? ""}`;
      })
      .filter(Boolean),
  };
}

module.exports = { conductResults, generatePresentationPlan, presentationHonestyBlock };
