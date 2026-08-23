"use strict";

/**
 * OpenAI-compatible tool definitions for dashboard UI control.
 * Battle-tested pattern: LLM emits tool_calls → client executes (see OpenAI / Groq / MCP tools).
 */

const UI_PRESENTATION_TOOLS = [
  {
    type: "function",
    function: {
      name: "show_self_heal_proof",
      description:
        "Open the Bright Data trust panel showing collector IDs (c_*) and self-heal events — use when explaining how scrapers recovered from broken hospital portals",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "set_layout",
      description: "Reshape the results page layout mode",
      parameters: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: [
              "explore",
              "stageFocus",
              "chartFocus",
              "compareSplit",
              "mapRoute",
              "spotlightHero",
              "savingsStory",
              "trustGaps",
            ],
          },
        },
        required: ["mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "expand_viewport_stage",
      description: "Expand a facility to a full-window modal-less analysis stage",
      parameters: {
        type: "object",
        properties: {
          facilityId: { type: "string" },
          depth: { type: "string", enum: ["hero", "fullWindow", "splitInspect"] },
        },
        required: ["facilityId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "spotlight_facility",
      description: "Highlight a facility card and map pin by node id (e.g. n5)",
      parameters: {
        type: "object",
        properties: { facilityId: { type: "string" } },
        required: ["facilityId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_tab",
      description: "Switch results tab",
      parameters: {
        type: "object",
        properties: {
          tab: { type: "string", enum: ["map", "scatter", "range", "compare", "chat"] },
        },
        required: ["tab"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reveal_facility",
      description: "Progressively reveal a facility card in the ranked list",
      parameters: {
        type: "object",
        properties: { facilityId: { type: "string" } },
        required: ["facilityId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_facilities",
      description: "Open side-by-side compare for two facilities",
      parameters: {
        type: "object",
        properties: {
          facilityA: { type: "string" },
          facilityB: { type: "string" },
        },
        required: ["facilityA", "facilityB"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "filter_results",
      description: "Filter visible hospitals",
      parameters: {
        type: "object",
        properties: {
          filter: { type: "string", enum: ["none", "accredited", "close", "cheap"] },
        },
        required: ["filter"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sort_results",
      description: "Sort ranked hospitals",
      parameters: {
        type: "object",
        properties: {
          sort: { type: "string", enum: ["price", "distance", "rating", "wait"] },
        },
        required: ["sort"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_route",
      description: "Show driving route to a facility on the map",
      parameters: {
        type: "object",
        properties: { facilityId: { type: "string" } },
        required: ["facilityId"],
      },
    },
  },
];

const PRESENTATION_JSON_SCHEMA = `Return ONLY valid JSON:
{
  "spokenScript": "2-4 sentences opener — mention data source honestly",
  "steps": [
    {
      "tool": "set_layout|show_self_heal_proof|expand_viewport_stage|spotlight_facility|set_tab|reveal_facility|compare_facilities|filter_results|sort_results|show_route",
      "args": {},
      "delayMs": 800,
      "caption": "Short line spoken while this UI change happens"
    }
  ]
}
Rules: 5-9 steps, stagger delays 600-1800ms, start with set_layout explore, spotlight the recommended facility, end on map or chart. Use real facility ids from data.
If SCRAPE CONTEXT mentions self-healing or heal events, include show_self_heal_proof early (after opener) with a caption naming the collector id and that Bright Data repaired the scraper without app code changes.`;

function toolCallToUiAction(name, args) {
  const a = args || {};
  switch (name) {
    case "set_layout":
      return { type: "layout", payload: a.mode };
    case "show_self_heal_proof":
      return { type: "layout", payload: "trustGaps" };
    case "expand_viewport_stage":
      return { type: "expand_stage", payload: a.facilityId };
    case "spotlight_facility":
      return { type: "spotlight", payload: a.facilityId };
    case "set_tab":
      return { type: "tab", payload: a.tab };
    case "reveal_facility":
      return [{ type: "reveal", payload: a.facilityId }, { type: "show_card", payload: a.facilityId }];
    case "compare_facilities":
      return { type: "compare", facilityA: a.facilityA, facilityB: a.facilityB };
    case "filter_results":
      return { type: "filter", payload: a.filter };
    case "sort_results":
      return { type: "sort", payload: a.sort };
    case "show_route":
      return [
        { type: "route", payload: a.facilityId },
        { type: "layout", payload: "mapRoute" },
        { type: "tab", payload: "map" },
        { type: "spotlight", payload: a.facilityId },
      ];
    default:
      return null;
  }
}

function flattenToolActions(toolCalls) {
  const out = [];
  for (const call of toolCalls || []) {
    const mapped = toolCallToUiAction(call.name || call.tool, call.args || call.arguments);
    if (!mapped) continue;
    if (Array.isArray(mapped)) out.push(...mapped);
    else out.push(mapped);
  }
  return out;
}

function stepsToUiActions(steps) {
  const out = [];
  for (const step of steps || []) {
  const mapped = toolCallToUiAction(step.tool, step.args);
    if (!mapped) continue;
    if (Array.isArray(mapped)) out.push(...mapped);
    else out.push(mapped);
  }
  return out;
}

module.exports = {
  UI_PRESENTATION_TOOLS,
  PRESENTATION_JSON_SCHEMA,
  toolCallToUiAction,
  flattenToolActions,
  stepsToUiActions,
};
