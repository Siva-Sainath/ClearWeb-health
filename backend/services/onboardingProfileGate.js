"use strict";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PLACEHOLDER_VALUES = new Set([
  "value",
  "example",
  "unknown",
  "n/a",
  "na",
  "procedure",
  "condition",
  "insurance",
  "city",
  "zip",
  "zipcode",
  "radiusmi",
  "your value",
  "user value",
  "the value",
]);

const MEDICAL_TERMS =
  /\b(mri|ct|scan|brain|colonoscopy|surgery|procedure|priced|cost|visit|emergency|er)\b/i;

const KNOWN_CITIES = [
  "austin",
  "dallas",
  "houston",
  "san antonio",
  "round rock",
  "georgetown",
  "plano",
  "fort worth",
  "new braunfels",
  "san marcos",
];

function titleCase(s) {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function isValidCityName(city) {
  const v = norm(city);
  if (!v || isPlaceholderProfileValue(city)) return false;
  if (MEDICAL_TERMS.test(v)) return false;
  if (v.split(" ").length > 3) return false;
  if (v.length > 28) return false;
  return true;
}

function extractCityFromText(raw) {
  const text = norm(raw);

  for (const known of KNOWN_CITIES) {
    if (text.includes(known)) return titleCase(known);
  }

  const matches = [...raw.matchAll(/\bin\s+([A-Za-z][A-Za-z\s.'-]{1,22})/gi)];
  for (let i = matches.length - 1; i >= 0; i--) {
    let candidate = matches[i][1].trim().replace(/[.,!?]+$/, "");
    const words = candidate.split(/\s+/).filter(Boolean);
    if (words.length > 2) candidate = words.slice(-2).join(" ");
    else if (words.length > 1 && MEDICAL_TERMS.test(words[0])) candidate = words[words.length - 1];
    if (isValidCityName(candidate)) return titleCase(candidate);
  }

  return null;
}

function latestUserMessage(messages) {
  const users = (messages || []).filter((m) => m.role === "user");
  return users.length ? users[users.length - 1].content : "";
}

/** LLMs copy placeholder text from prompts — never accept these as profile data. */
function isPlaceholderProfileValue(value) {
  const v = norm(value);
  if (!v || v.length < 2) return true;
  if (PLACEHOLDER_VALUES.has(v)) return true;
  if (/^<[^>]+>$/.test(String(value).trim())) return true;
  return false;
}

function userTexts(messages) {
  return norm(
    (messages || [])
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ")
  );
}

function valueMentioned(text, value) {
  const v = norm(value);
  if (!v) return false;
  if (text.includes(v)) return true;
  if (v.length <= 4) {
    return new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);
  }
  return false;
}

/** At least one meaningful token from value appears in user speech. */
function sharesTokensWithUser(text, value) {
  const tokens = norm(value)
    .split(" ")
    .filter((t) => t.length > 2 && !PLACEHOLDER_VALUES.has(t));
  if (!tokens.length) return false;
  const hits = tokens.filter((t) => text.includes(t));
  return hits.length >= Math.max(1, Math.ceil(tokens.length * 0.5));
}

function fieldSupported(text, key, value) {
  if (isPlaceholderProfileValue(value)) return false;
  if (valueMentioned(text, String(value))) return true;

  switch (key) {
    case "insurance":
      return sharesTokensWithUser(text, value);
    case "city":
      return isValidCityName(value) && sharesTokensWithUser(text, value);
    case "zipCode":
      return /\b\d{5}\b/.test(text) && String(value).replace(/\D/g, "").length >= 5;
    case "radiusMi": {
      const n = parseInt(String(value), 10);
      return n > 0 && (text.includes(String(n)) || /\b\d+\s*miles?\b/.test(text));
    }
    case "procedure":
    case "condition":
      return sharesTokensWithUser(text, value);
    case "cptCode":
      return /^\d{5}$/.test(String(value)) && !/^787\d{2}$/.test(String(value));
    case "priorities":
      return /\bcost\b|\bcheapest\b|\bdistance\b|\bclose\b|\baccredit\b|\bwait\b|\bquality\b/.test(
        text
      );
    default:
      return false;
  }
}

/** Pull procedure/condition from raw user speech when tags fail. */
function heuristicProfileFromMessages(messages) {
  const raw = latestUserMessage(messages) || (messages || [])
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");
  const text = norm(raw);
  const out = {};

  const procedurePatterns = [
    { re: /\b(?:brain|head)\s+mri\b|\bmri\s+(?:of\s+(?:the\s+)?)?(?:brain|head)\b/i, value: "Brain MRI", cpt: "70553" },
    { re: /\bknee\s+mri\b|\bmri\s+(?:of\s+(?:the\s+)?)?knee\b/i, value: "Knee MRI", cpt: "73721" },
    { re: /\bshoulder\s+mri\b|\bmri\s+(?:of\s+(?:the\s+)?)?shoulder\b/i, value: "Shoulder MRI", cpt: "73221" },
    { re: /\b(?:lumbar|spine|back)\s+mri\b|\bmri\s+(?:of\s+(?:the\s+)?)?(?:lumbar|spine|back)\b/i, value: "Lumbar MRI", cpt: "72148" },
    { re: /\bcolonoscopy\b/i, value: "Colonoscopy", cpt: "45378" },
    { re: /\b(?:er|emergency(?:\s+room)?)\s*(?:visit)?\b/i, value: "Emergency room visit", cpt: "99284" },
    { re: /\b(?:ct|cat)\s+scan\b/i, value: "CT scan", cpt: "74177" },
    { re: /\bmammogram\b/i, value: "Mammogram", cpt: "77067" },
    { re: /\bknee\s+replacement\b/i, value: "Knee replacement", cpt: "27447" },
    { re: /\bhip\s+replacement\b/i, value: "Hip replacement", cpt: "27130" },
    { re: /\bmri\s+(?:scan|of)\b/i, value: "MRI scan", cpt: "70553" },
    { re: /\b(?:need|want|get)\s+(?:a\s+)?(.{4,48}?)(?:\s+priced|\s+price|\s+cost|could you)/i, fromGroup: 1 },
    { re: /\bmri\b/i, value: "MRI", cpt: "70553" },
  ];

  for (const p of procedurePatterns) {
    const m = raw.match(p.re);
    if (!m) continue;
    let proc = p.value;
    if (p.fromGroup != null && m[p.fromGroup]) {
      proc = m[p.fromGroup]
        .replace(/\s+/g, " ")
        .replace(/\b(please|thanks|thank you)\b/gi, "")
        .trim();
      if (proc.length < 4) continue;
      proc = proc.charAt(0).toUpperCase() + proc.slice(1);
    }
    if (proc && !isPlaceholderProfileValue(proc)) {
      out.procedure = proc;
      if (p.cpt) out.cptCode = p.cpt;
      break;
    }
  }

  if (/\baetna\b|\batna\b|\betna\b/i.test(raw)) out.insurance = "Aetna";
  else if (/\bblue cross\b|\bbcbs\b/i.test(raw)) out.insurance = "Blue Cross";
  else if (/\bcigna\b/i.test(raw)) out.insurance = "Cigna";
  else if (/\bunited\b/i.test(raw)) out.insurance = "United Healthcare";
  else if (/\bhumana\b/i.test(raw)) out.insurance = "Humana";

  const zip = raw.match(/\b(\d{5})\b/);
  if (zip) out.zipCode = zip[1];

  const city = extractCityFromText(raw);
  if (city) out.city = city;

  const miles = raw.match(/\b(\d{2,3})\s*miles?\b/);
  if (miles) out.radiusMi = parseInt(miles[1], 10);

  return out;
}

function filterProfileByUserMessages(messages, extracted = {}, prev = {}) {
  const text = userTexts(messages);
  const out = {};

  const allow = (key, value) => {
    if (value == null || value === "") return;
    if (isPlaceholderProfileValue(value)) return;

    const supported = fieldSupported(text, key, value);
    if (!supported) return;

    if (key === "radiusMi") {
      const n = parseInt(String(value), 10);
      if (n > 0) out.radiusMi = n;
    } else if (key === "priorities" && Array.isArray(value) && value.length) {
      out.priorities = value;
    } else if (typeof value === "string" && value.trim()) {
      out[key] = value.trim();
    }
  };

  if (extracted.procedure) allow("procedure", extracted.procedure);
  if (extracted.condition) allow("condition", extracted.condition);
  if (extracted.cptCode) allow("cptCode", extracted.cptCode);
  if (extracted.insurance) allow("insurance", extracted.insurance);
  if (extracted.city) allow("city", extracted.city);
  if (extracted.zipCode) allow("zipCode", extracted.zipCode);
  if (extracted.radiusMi != null) allow("radiusMi", extracted.radiusMi);
  if (extracted.priorities) allow("priorities", extracted.priorities);

  return out;
}

function mergeHeuristicProfile(messages, extracted = {}, prev = {}) {
  const gated = filterProfileByUserMessages(messages, extracted, prev);
  const heuristic = heuristicProfileFromMessages(messages);
  const out = { ...gated };

  const fill = (key, value) => {
    if (out[key] || prev[key]) return;
    if (value == null || value === "") return;
    if (isPlaceholderProfileValue(value)) return;
    if (!fieldSupported(userTexts(messages), key, value)) return;
    out[key] = value;
  };

  fill("procedure", heuristic.procedure);
  fill("cptCode", heuristic.cptCode);
  fill("insurance", heuristic.insurance);
  fill("city", heuristic.city);
  fill("zipCode", heuristic.zipCode);
  fill("radiusMi", heuristic.radiusMi);

  return out;
}

module.exports = {
  filterProfileByUserMessages,
  mergeHeuristicProfile,
  heuristicProfileFromMessages,
  isPlaceholderProfileValue,
  valueMentioned,
  fieldSupported,
};
