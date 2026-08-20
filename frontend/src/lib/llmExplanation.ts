import type { InsightAccent } from "@/lib/facilityInsights";
import type { TabId } from "@/lib/uiActions";

export interface ExplanationInsightSection {
  type: "insight";
  title: string;
  body: string;
  emphasis?: InsightAccent;
  uiActions?: string[];
}

export interface ExplanationFacilityReveal {
  type: "facility_reveal";
  facilityId: string;
  reasons: string[];
  uiActions?: string[];
}

export type ExplanationSection = ExplanationInsightSection | ExplanationFacilityReveal;

export interface LlmExplanation {
  spokenScript: string;
  sections: ExplanationSection[];
  layout: "cards_then_map" | "map" | "compare" | string;
  defaultLayout?: string;
  uiActions: string[];
  ranked?: string[];
  recommendation?: string;
  reasoning?: string;
  savings?: number;
  tags?: Record<string, string>;
  suggestedFollowUps?: string[];
}

export function normalizeLlmExplanation(raw: unknown): LlmExplanation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sections = Array.isArray(o.sections) ? o.sections : [];
  const normalized: ExplanationSection[] = [];

  for (const sec of sections) {
    if (!sec || typeof sec !== "object") continue;
    const s = sec as Record<string, unknown>;
    if (s.type === "insight" && typeof s.title === "string" && typeof s.body === "string") {
      normalized.push({
        type: "insight",
        title: s.title,
        body: s.body,
        emphasis: (s.emphasis as InsightAccent) || "summary",
        uiActions: Array.isArray(s.uiActions) ? s.uiActions.map(String) : undefined,
      });
    } else if (s.type === "facility_reveal" && typeof s.facilityId === "string") {
      normalized.push({
        type: "facility_reveal",
        facilityId: s.facilityId,
        reasons: Array.isArray(s.reasons) ? s.reasons.map(String) : [],
        uiActions: Array.isArray(s.uiActions) ? s.uiActions.map(String) : undefined,
      });
    }
  }

  const spokenScript =
    typeof o.spokenScript === "string"
      ? o.spokenScript
      : typeof o.reasoning === "string"
        ? o.reasoning
        : "";

  if (!spokenScript && normalized.length === 0) return null;

  return {
    spokenScript,
    sections: normalized,
    layout: typeof o.layout === "string" ? o.layout : "cards_then_map",
    defaultLayout: typeof o.defaultLayout === "string" ? o.defaultLayout : undefined,
    uiActions: Array.isArray(o.uiActions) ? o.uiActions.map(String) : [],
    ranked: Array.isArray(o.ranked) ? o.ranked.map(String) : undefined,
    recommendation: typeof o.recommendation === "string" ? o.recommendation : undefined,
    reasoning: typeof o.reasoning === "string" ? o.reasoning : undefined,
    savings: typeof o.savings === "number" ? o.savings : undefined,
    tags: o.tags && typeof o.tags === "object" ? (o.tags as Record<string, string>) : undefined,
    suggestedFollowUps: Array.isArray(o.suggestedFollowUps)
      ? o.suggestedFollowUps.map(String)
      : undefined,
  };
}

export function insightSectionsFromExplanation(explanation: LlmExplanation) {
  return explanation.sections.filter((s) => s.type === "insight") as ExplanationInsightSection[];
}

export function revealedFacilityIds(explanation: LlmExplanation): string[] {
  return explanation.sections
    .filter((s) => s.type === "facility_reveal")
    .map((s) => (s as ExplanationFacilityReveal).facilityId);
}

export function tabLabel(tab: TabId): string {
  const labels: Record<TabId, string> = {
    map: "Map view",
    scatter: "Price scatter chart",
    range: "Price range chart",
    compare: "Compare facilities",
    chat: "Chat",
  };
  return labels[tab] ?? tab;
}
