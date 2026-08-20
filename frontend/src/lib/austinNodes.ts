"use client";

/**
 * Austin hospital price-transparency websites — one node per unique domain we crawl.
 * Multiple hospitals under the same health-system site share one spoke (no duplicate labels).
 */

import type { SourceNode } from "@/lib/types";

export const CX = 450;
export const CY = 280;
const RX = 300;
const RY = 220;

function ellipsePosition(index: number, total: number): { x: number; y: number } {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return {
    x: Math.round(CX + RX * Math.cos(angle)),
    y: Math.round(CY + RY * Math.sin(angle)),
  };
}

/** Legacy per-hospital ids (n1–n17) → unique website node id */
const HOSPITAL_TO_WEBSITE: Record<string, string> = {
  n1: "web_stdavids",
  n2: "web_stdavids",
  n3: "web_stdavids",
  n4: "web_stdavids",
  n5: "web_stdavids",
  n6: "web_bsw",
  n7: "web_bsw",
  n8: "web_ascension",
  n9: "web_ascension",
  n10: "web_ascension",
  n11: "web_westlake",
  n12: "web_oaks",
  n13: "web_encompass",
  n14: "web_encompass",
  n15: "web_shriners",
  n16: "web_christus",
  n17: "web_christus",
};

const NODE_DEFS: Omit<SourceNode, "x" | "y" | "status">[] = [
  {
    id: "web_stdavids",
    domain: "stdavids.com",
    label: "St. David's Health (5 hospitals)",
    shortLabel: "St. David's",
  },
  {
    id: "web_bsw",
    domain: "bswhealth.com",
    label: "Baylor Scott & White Health",
    shortLabel: "BSW Health",
  },
  {
    id: "web_ascension",
    domain: "ascension.org",
    label: "Ascension Texas (Dell Seton, Seton)",
    shortLabel: "Ascension",
  },
  {
    id: "web_westlake",
    domain: "westlakemedical.com",
    label: "Westlake Medical Center",
    shortLabel: "Westlake",
  },
  {
    id: "web_oaks",
    domain: "austinoakshospital.com",
    label: "Austin Oaks Hospital",
    shortLabel: "Austin Oaks",
  },
  {
    id: "web_encompass",
    domain: "encompasshealth.com",
    label: "Encompass Health (Austin + Round Rock)",
    shortLabel: "Encompass",
  },
  {
    id: "web_shriners",
    domain: "shrinerschildrens.org",
    label: "Shriners Children's Texas",
    shortLabel: "Shriners",
  },
  {
    id: "web_christus",
    domain: "christushealth.org",
    label: "CHRISTUS Santa Rosa (San Marcos + New Braunfels)",
    shortLabel: "CHRISTUS",
  },
];

export const HOSPITAL_NODE_COUNT = NODE_DEFS.length;

export const INITIAL_NODES: SourceNode[] = NODE_DEFS.map((node, i) => ({
  ...node,
  ...ellipsePosition(i, NODE_DEFS.length),
  status: "idle" as const,
}));

function matchWebsiteFromText(text: string): string | null {
  const t = text.toLowerCase();
  if (/st\.?\s*david|stdavids/.test(t)) return "web_stdavids";
  if (/baylor|bsw|scott.*white/.test(t)) return "web_bsw";
  if (/dell seton|ascension|seton northwest|seton medical/.test(t)) return "web_ascension";
  if (/westlake/.test(t)) return "web_westlake";
  if (/austin oaks/.test(t)) return "web_oaks";
  if (/encompass/.test(t)) return "web_encompass";
  if (/shriners/.test(t)) return "web_shriners";
  if (/christus|santa rosa/.test(t)) return "web_christus";
  return null;
}

/** Map scrape SSE / replay events to a unique website node (not per-hospital duplicates). */
export function resolveScrapeNodeId(data: {
  node_id?: string;
  collector_id?: string;
  facility_name?: string;
  detail?: string;
}): string | null {
  if (data.node_id && HOSPITAL_TO_WEBSITE[data.node_id]) {
    return HOSPITAL_TO_WEBSITE[data.node_id];
  }

  const scraperMatch = data.collector_id?.match(/scraper-(n\d+)/);
  if (scraperMatch && HOSPITAL_TO_WEBSITE[scraperMatch[1]]) {
    return HOSPITAL_TO_WEBSITE[scraperMatch[1]];
  }

  const fromFacility = data.facility_name ? matchWebsiteFromText(data.facility_name) : null;
  if (fromFacility) return fromFacility;

  if (data.detail) {
    const fromDetail = matchWebsiteFromText(data.detail);
    if (fromDetail) return fromDetail;
  }

  return null;
}

export function nodeDisplayLabel(node: SourceNode): string {
  return node.shortLabel ?? node.label;
}
