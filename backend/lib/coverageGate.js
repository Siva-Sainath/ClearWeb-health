"use strict";

const { inferProcedureCpt } = require("./procedureCpt");

const COVERED_ZIPS = new Set([
  "78701", "78702", "78703", "78704", "78705", "78712",
  "78731", "78732", "78733", "78734", "78735", "78741",
  "78744", "78745", "78746", "78747", "78748", "78749",
  "78750", "78751", "78752", "78753", "78754", "78756",
  "78757", "78758", "78759",
]);

const COVERED_CPTS = new Set([
  "72148", "72149", "72158", "45378", "70553", "27447", "44950", "99283",
]);

const OUT_OF_AREA =
  /\b(dallas|houston|san antonio|el paso|fort worth|plano|irving|arlington|dfw)\b/i;
const COVERED_CITY = /\b(austin|round rock|travis)\b/i;

function coverageBlockFromProfile(profile = {}) {
  const city = String(profile.city || "").trim();
  if (city && OUT_OF_AREA.test(city) && !COVERED_CITY.test(city)) {
    return { kind: "area", detail: city };
  }
  const zip = String(profile.zipCode || profile.zip || "").trim();
  if (zip && zip.length === 5 && !COVERED_ZIPS.has(zip)) {
    return { kind: "area", detail: zip };
  }
  const asked = `${profile.procedure || ""} ${profile.condition || ""} ${profile.cptCode || ""}`;
  const inferred = inferProcedureCpt(asked) || (profile.cptCode ? { cpt: String(profile.cptCode), label: profile.procedure } : null);
  if (inferred?.cpt && !COVERED_CPTS.has(inferred.cpt)) {
    return { kind: "procedure", detail: inferred.label || inferred.cpt };
  }
  return null;
}

function canPriceInDemo(profile) {
  return coverageBlockFromProfile(profile) == null;
}

module.exports = { coverageBlockFromProfile, canPriceInDemo, COVERED_CPTS, COVERED_ZIPS };
