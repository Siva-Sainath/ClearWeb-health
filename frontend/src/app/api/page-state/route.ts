import { NextResponse } from "next/server";

const globalAny = globalThis as typeof globalThis & {
  pageState?: Record<string, unknown>;
  webcmdSecret?: string;
};

function checkAuth(request: Request): boolean {
  const secret = process.env.WEBCMD_BRIDGE_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(globalAny.pageState ?? {});
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    globalAny.pageState = body;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
