import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const BOT_ROOT = join(process.cwd(), "..");

export async function GET() {
  const s = readSettings();
  // A persisted browser profile means a Luma session was saved via `npm run login`.
  const profileDir = join(BOT_ROOT, ".luma-profile");
  const connected = existsSync(profileDir);
  return NextResponse.json({
    connected,
    calendarUrl: s.lumaCalendarUrl,
    dryRun: s.lumaDryRun,
  });
}
