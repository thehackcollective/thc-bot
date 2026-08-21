import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = verifySession(cookies().get(COOKIE)?.value);
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({
    ok: true,
    user: { username: session.username, role: session.role, mustChangePassword: session.mc },
  });
}
