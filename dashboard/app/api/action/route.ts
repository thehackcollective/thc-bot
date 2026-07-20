import { NextResponse } from "next/server";
import { getLead, setStatus } from "@/lib/db";
import { spawnPublish } from "@/lib/publish";

export const dynamic = "force-dynamic";

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
      setStatus(lead.id, "approved");
      // Fire-and-forget publish. spawnPublish holds an in-process lock, so a
      // concurrent publish for the same lead is refused rather than launching a
      // second browser that would duplicate the calendar entry.
      const child = spawnPublish(lead.id, { detached: true, stdio: "ignore" });
      if (!child) {
        return NextResponse.json(
          { ok: false, error: "already publishing this lead" },
          { status: 409 },
        );
      }
      child.unref();
      return NextResponse.json({ ok: true, publishing: true });
    } else {
      return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
