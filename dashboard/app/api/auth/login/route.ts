import { NextResponse } from "next/server";
import { authenticate, COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // needs better-sqlite3 + node:crypto

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ ok: false, error: "Username and password required" }, { status: 400 });
    }
    const user = authenticate(String(username), String(password));
    if (!user) {
      return NextResponse.json({ ok: false, error: "Invalid username or password" }, { status: 401 });
    }
    const token = signSession({
      uid: user.id,
      username: user.username,
      role: user.role,
      mc: user.mustChangePassword,
    });
    const res = NextResponse.json({
      ok: true,
      user: { username: user.username, role: user.role, mustChangePassword: user.mustChangePassword },
    });
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
