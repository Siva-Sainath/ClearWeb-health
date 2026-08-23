import { NextResponse } from "next/server";

const globalAny = globalThis as typeof globalThis & {
  pendingActions?: unknown[];
};

function checkAuth(request: Request): boolean {
  const secret = process.env.WEBCMD_BRIDGE_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

const VALID_TYPES = new Set([
  "tab", "spotlight", "filter", "sort", "compare", "show_card", "reset",
  "layout", "highlight", "reveal", "call", "book", "route", "chip", "expand_stage",
  "navigate_phase", "navigate_panel", "navigate_scroll", "navigate_url",
]);

function normalizeAction(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object" && "actions" in body) {
    return (body as { actions: unknown[] }).actions;
  }
  if (body && typeof body === "object" && "type" in body) {
    return [body];
  }
  return [];
}

export async function GET() {
  const actions = globalAny.pendingActions ?? [];
  globalAny.pendingActions = [];
  return NextResponse.json({ actions });
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const incoming = normalizeAction(body).filter(
      (a) => a && typeof a === "object" && "type" in a && VALID_TYPES.has((a as { type: string }).type)
    );
    if (!globalAny.pendingActions) globalAny.pendingActions = [];
    globalAny.pendingActions.push(...incoming);
    return NextResponse.json({ success: true, queued: incoming.length });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
