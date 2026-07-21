import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifySessionEdge } from "@/lib/edge-auth";

// Routes reachable without a session.
const PUBLIC_PATHS = ["/login", "/api/auth/login"];
// Routes that require the super_admin role.
const SUPER_ADMIN_PATHS = ["/users", "/api/users"];
// Routes a must-change-password user may still reach (to change it or sign out).
const CHANGE_PW_ALLOWED = ["/change-password", "/api/auth/change-password", "/api/auth/logout", "/api/auth/me"];

function matches(path: string, list: string[]): boolean {
  return list.some((p) => path === p || path.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (matches(pathname, PUBLIC_PATHS)) return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;
  const session = await verifySessionEdge(token, process.env.SESSION_SECRET);
  const isApi = pathname.startsWith("/api/");

  if (!session) {
    if (isApi) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Must-change-password users are boxed into the change-password flow until they comply.
  if (session.mc && !matches(pathname, CHANGE_PW_ALLOWED)) {
    if (isApi) return NextResponse.json({ ok: false, error: "Password change required" }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = "/change-password";
    return NextResponse.redirect(url);
  }

  if (matches(pathname, SUPER_ADMIN_PATHS) && session.role !== "super_admin") {
    if (isApi) return NextResponse.json({ ok: false, error: "Super admin only" }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static assets in /public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};
