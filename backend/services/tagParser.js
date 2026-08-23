"use strict";

const ACTION_RE = /\[action:([^\]]*)\]/g;
const PROFILE_RE = /\[profile:([^:\]]+):([^\]]*)\]/g;
const NAVIGATE_RE = /\[navigate:([^\]]*)\]/g;
const ANY_TAG_RE = /\[[a-z][a-z0-9_-]*(?::[^\]]*)?\]/gi;
const TRAILING_OPEN_TAG_RE = /\[[^\]]*$/;

function parseActionTag(raw) {
  const parts = raw.split(":");
  const type = parts[0];
  switch (type) {
    case "tab":
      return parts[1] ? { type: "tab", payload: parts[1] } : null;
    case "spotlight":
      return parts[1] ? { type: "spotlight", payload: parts[1] } : null;
    case "filter":
      return parts[1] ? { type: "filter", payload: parts[1] } : null;
    case "sort":
      return parts[1] ? { type: "sort", payload: parts[1] } : null;
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
      return parts[1] ? { type: "layout", payload: parts[1] } : null;
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

function parseNavigateTag(raw) {
  const parts = raw.split(":");
  const kind = parts[0];
  if (kind === "phase" && parts[1]) return { type: "navigate", kind: "phase", payload: parts[1] };
  if (kind === "tab" && parts[1]) return { type: "navigate", kind: "tab", payload: parts[1] };
  if (kind === "panel" && parts[1]) return { type: "navigate", kind: "panel", payload: parts[1] };
  if (kind === "scroll" && parts[1] === "facility" && parts[2])
    return { type: "navigate", kind: "scroll", payload: parts[2] };
  if (kind === "url" && parts[1])
    return { type: "navigate", kind: "url", payload: decodeURIComponent(parts.slice(1).join(":")) };
  return null;
}

function parseAllTags(text) {
  const actions = [];
  const profileUpdates = {};
  const navigations = [];

  text.replace(ACTION_RE, (_, raw) => {
    const a = parseActionTag(raw);
    if (a) actions.push(a);
    return "";
  });

  text.replace(PROFILE_RE, (_, field, value) => {
    const v = String(value || "").trim();
    if (v) profileUpdates[field.trim()] = v;
    return "";
  });

  text.replace(NAVIGATE_RE, (_, raw) => {
    const n = parseNavigateTag(raw);
    if (n) navigations.push(n);
    return "";
  });

  const clean = text
    .replace(ACTION_RE, "")
    .replace(PROFILE_RE, "")
    .replace(NAVIGATE_RE, "")
    .replace(/\[show_card:[^\]]*\]/g, "")
    .replace(ANY_TAG_RE, "")
    .replace(TRAILING_OPEN_TAG_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { clean, actions, profileUpdates, navigations };
}

function stripTags(text) {
  return text
    .replace(ACTION_RE, "")
    .replace(PROFILE_RE, "")
    .replace(NAVIGATE_RE, "")
    .replace(/\[show_card:[^\]]*\]/g, "")
    .replace(ANY_TAG_RE, "")
    .replace(TRAILING_OPEN_TAG_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

module.exports = { parseAllTags, stripTags, parseActionTag, parseNavigateTag };
