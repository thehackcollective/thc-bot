import { NextResponse } from "next/server";
import { getLead, setStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Approve or reject a lead. Publishing is deliberately NOT handled here — it goes
 * through POST /api/publish, which is the single publish path (it streams the bot's
 * output back and holds the per-lead in-process lock).
 */
export async function POST(req: Request) {
  try {
    const { id, action } = (await req.json()) as { id: number; action: string };
    const lead = getLead(Number(id));
    if (!lead) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });

    if (action === "reject") {
      setStatus(lead.id, "rejected");
    } else if (action === "approve") {
      setStatus(lead.id, "approved");
    } else if (action === "publish") {
      return NextResponse.json(
        { ok: false, error: "use POST /api/publish to publish a lead" },
        { status: 400 },
      );
    } else {
      return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
