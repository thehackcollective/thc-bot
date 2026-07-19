import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BOT_ROOT = join(process.cwd(), "..");

// Persist the watcher on the module (survives across requests in the same dev-server process).
const g = globalThis as unknown as { __thcWatch?: ChildProcess; __thcWatchSince?: string };

function running(): boolean {
  return !!g.__thcWatch && !g.__thcWatch.killed && g.__thcWatch.exitCode === null;
}

// Start the bot's watch loop (wacli sync --follow + periodic scan) if not already running.
export async function POST() {
  if (running()) return NextResponse.json({ running: true, since: g.__thcWatchSince, started: false });

  const child = spawn("npm", ["run", "watch"], {
    cwd: BOT_ROOT,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  child.on("exit", () => {
    if (g.__thcWatch === child) g.__thcWatch = undefined;
  });
  g.__thcWatch = child;
  g.__thcWatchSince = new Date().toISOString();
  return NextResponse.json({ running: true, since: g.__thcWatchSince, started: true });
}

export async function GET() {
  return NextResponse.json({ running: running(), since: running() ? g.__thcWatchSince : null });
}
