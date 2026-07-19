import { NextResponse } from "next/server";
import { readSettings, writeSettings, type Settings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readSettings());
}

export async function POST(req: Request) {
  const patch = (await req.json()) as Partial<Settings>;
  return NextResponse.json(writeSettings(patch));
}
