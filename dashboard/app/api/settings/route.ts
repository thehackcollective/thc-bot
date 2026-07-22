import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, getUser, verifySession } from "@/lib/auth";
import { readSettings, writeSettings, type Settings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Settings that unlock high-impact, hard-to-undo behaviour: `lumaCalendarUrl` retargets
// the live community calendar. Only a super admin may change these.
const SUPER_ADMIN_FIELDS: (keyof Settings)[] = ["lumaCalendarUrl"];

// Middleware requires a session for /api/settings, but not the super_admin role. Re-verify
// against the DB (the cookie role can be stale) before applying sensitive changes.
function requireSuperAdmin(): { ok: true } | { ok: false; res: NextResponse } {
  const session = verifySession(cookies().get(COOKIE)?.value);
  if (!session) return { ok: false, res: NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 }) };
  const fresh = getUser(session.uid);
  if (!fresh || fresh.role !== "super_admin") {
    return { ok: false, res: NextResponse.json({ ok: false, error: "Super admin only" }, { status: 403 }) };
  }
  return { ok: true };
}

export async function GET() {
  return NextResponse.json(readSettings());
}

export async function POST(req: Request) {
  const patch = (await req.json()) as Partial<Settings>;
  if (SUPER_ADMIN_FIELDS.some((f) => f in patch)) {
    const auth = requireSuperAdmin();
    if (!auth.ok) return auth.res;
  }
  return NextResponse.json(writeSettings(patch));
}
