import { NextResponse } from "next/server";
import { flagStats, listFlags, setFlagStatus, type FlagStatus } from "@/lib/db";

export const dynamic = "force-dynamic"; // always read fresh from SQLite

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") as FlagStatus | "all" | null;
  const flags = status && status !== "all" ? listFlags(status) : listFlags();
  return NextResponse.json({ flags, stats: flagStats() });
}

export async function POST(req: Request) {
  try {
    const { id, action } = await req.json();
    if (action !== "confirm" && action !== "dismiss") throw new Error("unknown action");
    setFlagStatus(Number(id), action === "confirm" ? "confirmed" : "dismissed");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
