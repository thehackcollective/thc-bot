import { NextResponse } from "next/server";
import { listLeads, purgeOldRejects, stats, type LeadStatus } from "@/lib/db";

export const dynamic = "force-dynamic"; // always read fresh from SQLite

export async function GET(req: Request) {
  purgeOldRejects(30); // rejects older than 30 days age out automatically
  const status = new URL(req.url).searchParams.get("status") as LeadStatus | "all" | null;
  const leads = status && status !== "all" ? listLeads(status) : listLeads();
  return NextResponse.json({ leads, stats: stats() });
}
