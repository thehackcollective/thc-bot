import { spawn } from "node:child_process";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BOT_ROOT = join(process.cwd(), "..");
const BOT_PORT = process.env.WA_WEBHOOK_PORT || "4610";

/**
 * Ask the bot itself whether it's alive, rather than tracking a child handle.
 *
 * The bot binds a loopback port as a singleton, so this is authoritative even when
 * the bot was started from a terminal. Tracking a spawned child in a module global
 * did not survive Next's hot recompiles, so every reload spawned another bot —
 * which is how nine of them ended up running at once.
 */
async function botStatus(): Promise<{ running: boolean; since: string | null; pid?: number }> {
  try {
    const res = await fetch(`http://127.0.0.1:${BOT_PORT}/health`, {
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!res.ok) return { running: false, since: null };
    const j = await res.json();
    return { running: true, since: j?.since ?? null, pid: j?.pid };
  } catch {
    return { running: false, since: null };
  }
}

/** Start the bot's watch loop, but only if nothing is already listening. */
export async function POST() {
  const before = await botStatus();
  if (before.running) return NextResponse.json({ ...before, started: false });

  const child = spawn("npm", ["run", "watch"], {
    cwd: BOT_ROOT,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

  // Give it a moment to bind, then report what's actually true rather than assuming.
  await new Promise((r) => setTimeout(r, 1200));
  const after = await botStatus();
  return NextResponse.json({ ...after, started: after.running });
}

export async function GET() {
  return NextResponse.json(await botStatus());
}
