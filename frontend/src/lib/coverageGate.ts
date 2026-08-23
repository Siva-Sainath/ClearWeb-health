import type { PatientProfile } from "@/lib/types";
import { CACHED_CPTS, COVERAGE_ZIPS } from "@/lib/coverageFacts";
import { inferProcedureCpt } from "@/lib/procedureCpt";

const COVERED_ZIP = new Set<string>(COVERAGE_ZIPS);
const COVERED_CPT = new Set<string>(CACHED_CPTS);

const OUT_OF_AREA =
  /\b(dallas|houston|san antonio|san antonio|el paso|fort worth|plano|irving|arlington|dfw|texas medical center)\b/i;

const COVERED_CITY = /\b(austin|round rock|travis)\b/i;

export type CoverageBlock = {
  kind: "area" | "procedure";
  speech: string;
};

function zipFrom(text: string): string | undefined {
  return text.match(/\b(787\d{2}|[0-9]{5})\b/)?.[1];
}

function areaBlock(place: string): CoverageBlock {
  return {
    kind: "area",
    speech: `I don't have ${place} prices in this demo. Look at the panel on your right — I only price those Austin metro ZIPs. Pick one from that list and I'll pull real cached files.`,
  };
}

function procedureBlock(name: string): CoverageBlock {
  return {
    kind: "procedure",
    speech: `I don't have ${name} in the scrape cache, so I won't show you another procedure's dollars. Look at the panel on your right — lumbar MRI is the densest file, plus colonoscopy and a few others. Name one of those.`,
  };
}

export function coverageBlockFromText(text: string): CoverageBlock | null {
  const t = text.trim();
  if (!t) return null;
  if (OUT_OF_AREA.test(t) && !COVERED_CITY.test(t)) {
    const place = t.match(OUT_OF_AREA)?.[1] || "that city";
    return areaBlock(place);
  }
  const zip = zipFrom(t);
  if (zip && !COVERED_ZIP.has(zip)) {
    return areaBlock(`ZIP ${zip}`);
  }
  const inferred = inferProcedureCpt(t);
  if (inferred?.cpt && !COVERED_CPT.has(inferred.cpt)) {
    return procedureBlock(inferred.label || `CPT ${inferred.cpt}`);
  }
  return null;
}

export function coverageBlockFromProfile(profile: PatientProfile): CoverageBlock | null {
  const city = profile.city?.trim() || "";
  if (city && OUT_OF_AREA.test(city) && !COVERED_CITY.test(city)) {
    return areaBlock(city);
  }
  const zip = profile.zipCode?.trim();
  if (zip && zip.length === 5 && !COVERED_ZIP.has(zip)) {
    return areaBlock(`ZIP ${zip}`);
  }
  const asked = `${profile.procedure || ""} ${profile.condition || ""} ${profile.cptCode || ""}`.trim();
  const inferred = inferProcedureCpt(asked) || (profile.cptCode ? { cpt: profile.cptCode, label: profile.procedure } : null);
  if (inferred?.cpt && !COVERED_CPT.has(inferred.cpt)) {
    return procedureBlock(inferred.label || profile.procedure || `CPT ${inferred.cpt}`);
  }
  return null;
}

export function canPriceInDemo(profile: PatientProfile): boolean {
  return coverageBlockFromProfile(profile) == null;
}
