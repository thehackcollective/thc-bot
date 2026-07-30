import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { changePassword, COOKIE, getUser, SESSION_MAX_AGE, signSession, verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = verifySession(cookies().get(COOKIE)?.value);
  if (!session) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  try {
    const { currentPassword, newPassword } = await req.json();
    changePassword(session.uid, String(currentPassword || ""), String(newPassword || ""));

    // Re-issue the cookie with the must-change flag cleared so the user is let back in.
    const user = getUser(session.uid)!;
    const token = signSession({ uid: user.id, username: user.username, role: user.role, mc: false });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}
