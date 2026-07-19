import { spawn } from "node:child_process";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getLead, setStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

const BOT_ROOT = join(process.cwd(), "..");

// Kick off the bot's Luma publisher for one lead (launches a browser via Stagehand).
// Detached + non-blocking; the bot flips status to 'published' when it finishes.
function spawnPublish(id: number) {
  const child = spawn("npm", ["run", "publish", "--", String(id)], {
    cwd: BOT_ROOT,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
}

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
      spawnPublish(lead.id);
      return NextResponse.json({ ok: true, publishing: true });
    } else {
      return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
