#!/usr/bin/env node
/**
 * MCP bridge for external agents (Antigravity, Claude Desktop, Cursor).
 * Exposes get_page_state + apply_ui_action over stdio — wraps existing HTTP webcmd API.
 *
 * Usage:
 *   node scripts/mcp-ui-bridge.mjs
 *
 * Env: FRONTEND_URL, WEBCMD_BRIDGE_SECRET
 */

import { createInterface } from "node:readline";

const FRONTEND = process.env.FRONTEND_URL || "http://localhost:3000";
const SECRET = process.env.WEBCMD_BRIDGE_SECRET || "clearweb-dev-bridge";

const TOOLS = [
  {
    name: "get_page_state",
    description: "Read live Clearweb dashboard snapshot (facilities, layout, scrape mode)",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "apply_ui_action",
    description: "Queue a UI action on the dashboard (layout, spotlight, tab, reveal, route, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        payload: { type: "string" },
        facilityA: { type: "string" },
        facilityB: { type: "string" },
      },
      required: ["type"],
      additionalProperties: true,
    },
  },
];

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

async function getPageState() {
  const res = await fetch(`${FRONTEND}/api/page-state`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  if (!res.ok) throw new Error(`page-state ${res.status}`);
  return res.json();
}

async function applyUiAction(args) {
  const res = await fetch(`${FRONTEND}/api/webcmd-action`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`webcmd-action ${res.status}: ${text}`);
  }
  return res.json();
}

async function handleTool(name, args) {
  if (name === "get_page_state") return await getPageState();
  if (name === "apply_ui_action") return await applyUiAction(args);
  throw new Error(`Unknown tool: ${name}`);
}

function handleRequest(req) {
  const { id, method, params } = req;

  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "clearweb-ui-bridge", version: "1.0.0" },
      },
    });
    return;
  }

  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    return;
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments || {};
    handleTool(name, args)
      .then((data) => {
        send({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] },
        });
      })
      .catch((err) => {
        send({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: err.message }], isError: true },
        });
      });
    return;
  }

  if (method === "notifications/initialized") return;

  send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    handleRequest(JSON.parse(line));
  } catch (err) {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: err.message } });
  }
});
