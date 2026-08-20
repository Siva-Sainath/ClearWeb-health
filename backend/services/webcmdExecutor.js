"use strict";

const axios = require("axios");
const { env } = require("../config/env");

async function postWebcmdActions(actions) {
  if (!env.WEBCMD_ENABLED || !actions?.length) return;

  const secret = env.WEBCMD_BRIDGE_SECRET;
  if (!secret) return;

  try {
    for (const action of actions) {
      await axios.post(`${env.FRONTEND_URL}/api/webcmd-action`, action, {
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      });
    }
  } catch (err) {
    console.warn("[webcmdExecutor]", err.message);
  }
}

function navigationsToActions(navigations) {
  return navigations.map((n) => {
    if (n.kind === "phase") return { type: "navigate_phase", payload: n.payload };
    if (n.kind === "tab") return { type: "tab", payload: n.payload };
    if (n.kind === "panel") return { type: "navigate_panel", payload: n.payload };
    if (n.kind === "scroll") return { type: "navigate_scroll", payload: n.payload };
    if (n.kind === "url") return { type: "navigate_url", payload: n.payload };
    return null;
  }).filter(Boolean);
}

async function executeUICommands({ actions = [], navigations = [] }) {
  const all = [...actions, ...navigationsToActions(navigations)];
  await postWebcmdActions(all);
  return all;
}

module.exports = { executeUICommands, postWebcmdActions, navigationsToActions };
