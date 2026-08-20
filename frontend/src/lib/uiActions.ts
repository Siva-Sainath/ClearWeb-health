/**
 * uiActions.ts — Agent-controlled UI action system.
 */

import type { PatientProfile, PatientPriority } from "./types";

export type TabId = "chat" | "map" | "scatter" | "range" | "compare";
export type SortMode = "price" | "distance" | "rating" | "wait";
export type FilterMode = "none" | "accredited" | "close" | "cheap";

export type LayoutMode =
  | "explore"
  | "chartFocus"
  | "compareSplit"
  | "mapRoute"
  | "spotlightHero"
  | "savingsStory"
  | "trustGaps";

export type UIAction =
  | { type: "tab"; payload: TabId }
  | { type: "spotlight"; payload: string }
  | { type: "filter"; payload: FilterMode }
  | { type: "sort"; payload: SortMode }
  | { type: "compare"; facilityA: string; facilityB: string }
  | { type: "show_card"; payload: string }
  | { type: "call"; payload: string }
  | { type: "book"; payload: string }
  | { type: "route"; payload: string }
  | { type: "layout"; payload: LayoutMode }
  | { type: "highlight"; payload: string }
  | { type: "reveal"; payload: string }
  | { type: "chip"; payload: string }
  | { type: "reset" }
  | { type: "navigate_phase"; payload: string }
  | { type: "navigate_panel"; payload: string }
  | { type: "navigate_scroll"; payload: string }
  | { type: "navigate_url"; payload: string };

export type NavigateCommand =
  | { type: "navigate"; kind: "phase"; payload: string }
  | { type: "navigate"; kind: "tab"; payload: TabId }
  | { type: "navigate"; kind: "panel"; payload: string }
  | { type: "navigate"; kind: "scroll"; payload: string }
  | { type: "navigate"; kind: "url"; payload: string };

const ACTION_RE = /\[action:([^\]]+)\]/g;
const PROFILE_RE = /\[profile:([^:]+):([^\]]+)\]/g;
const NAVIGATE_RE = /\[navigate:([^\]]+)\]/g;

function parseActionRaw(raw: string): UIAction | null {
  const parts = raw.split(":");
  const type = parts[0];
  switch (type) {
    case "tab":
      return parts[1] ? { type: "tab", payload: parts[1] as TabId } : null;
    case "spotlight":
      return parts[1] ? { type: "spotlight", payload: parts[1] } : null;
    case "filter":
      return parts[1] ? { type: "filter", payload: parts[1] as FilterMode } : null;
    case "sort":
      return parts[1] ? { type: "sort", payload: parts[1] as SortMode } : null;
    case "compare":
      return parts[1] && parts[2]
        ? { type: "compare", facilityA: parts[1], facilityB: parts[2] }
        : null;
    case "show_card":
      return parts[1] ? { type: "show_card", payload: parts[1] } : null;
    case "call":
      return parts[1] ? { type: "call", payload: parts[1] } : null;
    case "book":
      return parts[1] ? { type: "book", payload: parts[1] } : null;
    case "route":
      return parts[1] ? { type: "route", payload: parts[1] } : null;
    case "layout":
      return parts[1] ? { type: "layout", payload: parts[1] as LayoutMode } : null;
    case "highlight":
      return parts[1] ? { type: "highlight", payload: parts[1] } : null;
    case "reveal":
      return parts[1] ? { type: "reveal", payload: parts[1] } : null;
    case "chip":
      return parts[1] ? { type: "chip", payload: parts[1] } : null;
    case "reset":
      return { type: "reset" };
    default:
      return null;
  }
}

function parseNavigateRaw(raw: string): NavigateCommand | UIAction | null {
  const parts = raw.split(":");
  const kind = parts[0];
  if (kind === "phase" && parts[1]) return { type: "navigate_phase", payload: parts[1] };
  if (kind === "tab" && parts[1]) return { type: "tab", payload: parts[1] as TabId };
  if (kind === "panel" && parts[1]) return { type: "navigate_panel", payload: parts[1] };
  if (kind === "scroll" && parts[1] === "facility" && parts[2])
    return { type: "navigate_scroll", payload: parts[2] };
  if (kind === "url" && parts[1])
    return { type: "navigate_url", payload: decodeURIComponent(parts.slice(1).join(":")) };
  return null;
}

export function parseActionStrings(rawActions: string[]): UIAction[] {
  const actions: UIAction[] = [];
  for (const raw of rawActions) {
    const a = parseActionRaw(raw.trim());
    if (a) actions.push(a);
  }
  return actions;
}

export function parseActions(text: string): { clean: string; actions: UIAction[] } {
  const actions: UIAction[] = [];
  const clean = text.replace(ACTION_RE, (_, raw: string) => {
    const a = parseActionRaw(raw);
    if (a) actions.push(a);
    return "";
  });
  return { clean: clean.trim(), actions };
}

export function parseProfileTags(text: string): Partial<PatientProfile> {
  const updates: Partial<PatientProfile> = {};
  text.replace(PROFILE_RE, (_, field: string, value: string) => {
    const f = field.trim();
    const v = value.trim();
    if (f === "radiusMi") updates.radiusMi = parseInt(v, 10) || 25;
    else if (f === "priority") {
      updates.priorities = [v as PatientPriority];
    } else if (f === "documentNames") {
      updates.documentNames = v.split(",").map((s) => s.trim());
    } else if (f in EMPTY_PROFILE_KEYS) {
      (updates as Record<string, string>)[f] = v;
    }
    return "";
  });
  return updates;
}

const EMPTY_PROFILE_KEYS = {
  condition: true,
  procedure: true,
  cptCode: true,
  insurance: true,
  zipCode: true,
};

export function parseNavigations(text: string): UIAction[] {
  const actions: UIAction[] = [];
  text.replace(NAVIGATE_RE, (_, raw: string) => {
    const n = parseNavigateRaw(raw);
    if (n) actions.push(n as UIAction);
    return "";
  });
  return actions;
}

export function parseAllTags(text: string) {
  const { actions } = parseActions(text);
  const profileUpdates = parseProfileTags(text);
  const navActions = parseNavigations(text);
  const clean = stripTags(text);
  return {
    clean,
    actions: [...actions, ...navActions],
    profileUpdates,
  };
}

export function stripTags(text: string): string {
  return text
    .replace(ACTION_RE, "")
    .replace(PROFILE_RE, "")
    .replace(NAVIGATE_RE, "")
    .replace(/\[show_card:[^\]]+\]/g, "")
    .trim();
}

export function buildUIStateContext(state: {
  activeTab: TabId;
  layoutMode: LayoutMode;
  spotlightId: string | null;
  highlightId: string | null;
  filterMode: FilterMode;
  sortMode: SortMode;
  compareA: string | null;
  compareB: string | null;
  visibleCount: number;
  totalCount: number;
  suggestedFollowUps?: string[];
}): string {
  return `
CURRENT DASHBOARD STATE (live):
- Layout mode: ${state.layoutMode}
- Active tab: ${state.activeTab}
- Filter: ${state.filterMode}
- Sort: ${state.sortMode}
- Spotlight: ${state.spotlightId ?? "none"}
- Highlight: ${state.highlightId ?? "none"}
- Visible facilities: ${state.visibleCount} / ${state.totalCount}
${state.activeTab === "compare" ? `- Comparing: ${state.compareA} vs ${state.compareB}` : ""}
${state.suggestedFollowUps?.length ? `- Suggested chips: ${state.suggestedFollowUps.join(", ")}` : ""}
`.trim();
}

/** Expand chip shorthand into a full choreography */
export function expandChipAction(chip: string): UIAction[] {
  switch (chip) {
    case "cheap":
      return [
        { type: "layout", payload: "chartFocus" },
        { type: "filter", payload: "cheap" },
        { type: "sort", payload: "price" },
        { type: "tab", payload: "scatter" },
      ];
    case "compare":
      return [{ type: "chip", payload: "compare_top" }];
    case "map":
      return [
        { type: "layout", payload: "mapRoute" },
        { type: "tab", payload: "map" },
      ];
    case "book":
      return [{ type: "chip", payload: "book_top" }];
    case "accredited":
      return [
        { type: "filter", payload: "accredited" },
        { type: "tab", payload: "range" },
      ];
    case "trust":
      return [{ type: "layout", payload: "trustGaps" }];
    default:
      return [];
  }
}

export function expandUIActions(actions: UIAction[]): UIAction[] {
  const out: UIAction[] = [];
  for (const a of actions) {
    if (a.type === "chip") {
      if (a.payload === "compare_top" || a.payload === "compare") {
        out.push({ type: "layout", payload: "compareSplit" });
        out.push({ type: "tab", payload: "compare" });
      } else if (a.payload === "book_top" || a.payload === "book") {
        out.push({ type: "layout", payload: "spotlightHero" });
      } else {
        out.push(...expandChipAction(a.payload));
      }
    } else {
      out.push(a);
    }
  }
  return out;
}

export function navigationsToPhase(navActions: UIAction[]): string | null {
  const phase = navActions.find((a) => a.type === "navigate_phase");
  return phase?.type === "navigate_phase" ? phase.payload : null;
}
