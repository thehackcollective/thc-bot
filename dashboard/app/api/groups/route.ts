import { NextResponse } from "next/server";
import { listGroups } from "@/lib/wacli";
import { readSettings, writeSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [groups, settings] = [await listGroups(), readSettings()];
    return NextResponse.json({ groups, selected: settings.groups });
  } catch (e) {
    return NextResponse.json(
      { groups: [], selected: readSettings().groups, error: String((e as Error).message) },
      { status: 200 },
    );
  }
}

// Set the full selection of scanned group JIDs.
export async function POST(req: Request) {
  const { groups } = (await req.json()) as { groups: string[] };
  const next = writeSettings({ groups: Array.from(new Set(groups)) });
  return NextResponse.json({ selected: next.groups });
}
