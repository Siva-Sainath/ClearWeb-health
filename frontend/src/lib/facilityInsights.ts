import type { FacilityResult, PatientProfile } from "@/lib/types";

export type InsightAccent = "cost" | "distance" | "quality" | "speed" | "summary";

export interface FacilityInsight {
  id: string;
  title: string;
  subtitle: string;
  highlight: string;
  facilityId: string;
  metric: string;
  accent: InsightAccent;
}

function withId(entry: FacilityResult & { id?: string }, key: string): string {
  return entry.id ?? key;
}

function pickMin(
  list: (FacilityResult & { id: string })[],
  key: keyof FacilityResult
): (FacilityResult & { id: string }) | null {
  if (!list.length) return null;
  return list.reduce((best, f) => {
    const a = Number(f[key]);
    const b = Number(best[key]);
    return a < b ? f : best;
  });
}

function pickMax(
  list: (FacilityResult & { id: string })[],
  key: keyof FacilityResult
): (FacilityResult & { id: string }) | null {
  if (!list.length) return null;
  return list.reduce((best, f) => {
    const a = Number(f[key]);
    const b = Number(best[key]);
    return a > b ? f : best;
  });
}

/** Derive flashcard insights from whatever fields Bright Data / mock scrape returns. */
export function buildFacilityFlashcards(
  facilities: Record<string, FacilityResult>,
  profile?: PatientProfile
): FacilityInsight[] {
  const entries = Object.entries(facilities).map(([key, f]) => ({
    ...f,
    id: withId(f, key),
  }));

  if (!entries.length) return [];

  const proc = profile?.procedure || profile?.condition || entries[0].procedure || "your procedure";
  const insights: FacilityInsight[] = [];

  const cheapest = pickMin(entries, "insurance_price");
  if (cheapest) {
    const savings = Math.max(
      0,
      ...entries.map((e) => e.insurance_price - cheapest.insurance_price)
    );
    insights.push({
      id: "best-cost",
      title: "Best with your plan",
      subtitle: cheapest.hospital_name,
      highlight: `$${cheapest.insurance_price}`,
      facilityId: cheapest.id,
      metric: savings > 0 ? `Save up to $${savings} vs. highest` : "Lowest in-network rate",
      accent: "cost",
    });
  }

  const nearest = pickMin(entries, "distance_mi");
  if (nearest) {
    insights.push({
      id: "nearest",
      title: "Closest option",
      subtitle: nearest.hospital_name,
      highlight: `${nearest.distance_mi} mi`,
      facilityId: nearest.id,
      metric: nearest.address ? nearest.address : `Within ${profile?.radiusMi ?? 25} mi search`,
      accent: "distance",
    });
  }

  const topRated = pickMax(entries, "rating");
  if (topRated && topRated.rating >= 4) {
    insights.push({
      id: "top-rated",
      title: "Highest rated",
      subtitle: topRated.hospital_name,
      highlight: `${topRated.rating}★`,
      facilityId: topRated.id,
      metric: topRated.accredited ? "Accredited facility" : "Patient reviews lead the area",
      accent: "quality",
    });
  }

  const fastest = pickMin(entries, "wait_days");
  if (fastest) {
    insights.push({
      id: "fastest",
      title: "Soonest appointment",
      subtitle: fastest.hospital_name,
      highlight: `${fastest.wait_days} days`,
      facilityId: fastest.id,
      metric: `Cash price $${fastest.cash_price} if paying out of pocket`,
      accent: "speed",
    });
  }

  const prices = entries.map((e) => e.insurance_price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  insights.unshift({
    id: "summary",
    title: `${entries.length} facilities found`,
    subtitle: proc,
    highlight: minP === maxP ? `$${minP}` : `$${minP} – $${maxP}`,
    facilityId: cheapest?.id ?? entries[0].id,
    metric: profile?.insurance ? `${profile.insurance} · CPT ${profile.cptCode || entries[0].cpt_code || "—"}` : "Insurance estimate range",
    accent: "summary",
  });

  return insights;
}
