"use strict";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function userTexts(messages) {
  return norm(
    (messages || [])
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ")
  );
}

function userSupportsInsurance(text) {
  return /\baetna\b|\batna\b|\betna\b|\bblue cross\b|\bcigna\b|\bunited\b|\bhumana\b|\binsurance\b/.test(text);
}

function userSupportsCity(text, city) {
  const c = norm(city);
  if (!c) return false;
  return text.includes(c) || /\baustin\b|\bdallas\b|\bhouston\b/.test(text);
}

function userSupportsZip(text) {
  return /\b\d{5}\b/.test(text);
}

function userSupportsRadius(text) {
  return /\b\d+\s*miles?\b|\bradius\b|\bhow far\b|\b25\b|\b50\b/.test(text);
}

function userSupportsProcedure(text) {
  return /\ber\b|\bemergency\b|\bvisit\b|\bmri\b|\bcolonoscopy\b|\bprocedure\b|\bbill\b/.test(text);
}

function userSupportsPriority(text) {
  return /\bcost\b|\bcheapest\b|\bdistance\b|\baccredit\b|\bwait\b/.test(text);
}

/** Drop LLM-hallucinated profile fields not spoken by the user. */
function filterProfileByUserMessages(messages, extracted = {}, prev = {}) {
  const text = userTexts(messages);
  const out = {};

  const allow = (key, supported, value) => {
    const already =
      key === "radiusMi"
        ? Number(prev.radiusMi) > 0
        : key === "priorities"
          ? Array.isArray(prev.priorities) && prev.priorities.length > 0
          : Boolean(String(prev[key] || "").trim());

    if (!supported && !already) return;

    if (key === "radiusMi") {
      const n = parseInt(String(value), 10);
      if (n > 0) out.radiusMi = n;
    } else if (key === "priorities" && Array.isArray(value) && value.length) {
      out.priorities = value;
    } else if (typeof value === "string" && value.trim()) {
      out[key] = value.trim();
    }
  };

  if (extracted.procedure) allow("procedure", userSupportsProcedure(text), extracted.procedure);
  if (extracted.condition) allow("condition", userSupportsProcedure(text), extracted.condition);
  if (extracted.cptCode) allow("cptCode", userSupportsProcedure(text), extracted.cptCode);
  if (extracted.insurance) allow("insurance", userSupportsInsurance(text), extracted.insurance);
  if (extracted.city) allow("city", userSupportsCity(text, extracted.city), extracted.city);
  if (extracted.zipCode) allow("zipCode", userSupportsZip(text), extracted.zipCode);
  if (extracted.radiusMi != null) allow("radiusMi", userSupportsRadius(text), extracted.radiusMi);
  if (extracted.priorities) allow("priorities", userSupportsPriority(text), extracted.priorities);

  return out;
}

module.exports = { filterProfileByUserMessages };
