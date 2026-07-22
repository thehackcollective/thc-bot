import { NextResponse } from "next/server";
import { status } from "@/lib/wacli";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await status());
}
