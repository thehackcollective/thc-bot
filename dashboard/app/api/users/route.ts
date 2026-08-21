import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, createUser, deleteUser, getUser, listUsers, verifySession, type Role } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Middleware already blocks non-super-admins from /api/users, but re-verify against the DB
// here too: the cookie role could be stale, and destructive ops deserve a fresh check.
function requireSuperAdmin(): { ok: true; username: string } | { ok: false; res: NextResponse } {
  const session = verifySession(cookies().get(COOKIE)?.value);
  if (!session) return { ok: false, res: NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 }) };
  const fresh = getUser(session.uid);
  if (!fresh || fresh.role !== "super_admin") {
    return { ok: false, res: NextResponse.json({ ok: false, error: "Super admin only" }, { status: 403 }) };
  }
  return { ok: true, username: fresh.username };
}

export async function GET() {
  const auth = requireSuperAdmin();
  if (!auth.ok) return auth.res;
  return NextResponse.json({ ok: true, users: listUsers() });
}

export async function POST(req: Request) {
  const auth = requireSuperAdmin();
  if (!auth.ok) return auth.res;
  try {
    const { username, password, role } = await req.json();
    const r: Role = role === "super_admin" ? "super_admin" : "admin";
    const user = createUser(String(username || ""), String(password || ""), r, auth.username);
    return NextResponse.json({ ok: true, user });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const auth = requireSuperAdmin();
  if (!auth.ok) return auth.res;
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!id) throw new Error("id required");
    deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
