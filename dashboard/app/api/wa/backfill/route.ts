import { NextResponse } from "next/server";
import { backfill } from "@/lib/wacli";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { jid, count, requests } = (await req.json()) as {
    jid: string;
    count?: number;
    requests?: number;
  };
  if (!jid) return NextResponse.json({ ok: false, error: "jid required" }, { status: 400 });
  backfill(jid, count ?? 200, requests ?? 3);
  return NextResponse.json({ ok: true });
}
