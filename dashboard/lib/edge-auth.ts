// Edge-runtime session verification for middleware. Mirrors signSession/verifySession in
// lib/auth.ts but uses Web Crypto (no Node APIs, no better-sqlite3) so it runs in middleware.
// Verify-only: signing and all DB access stay in the Node runtime.

export type Role = "super_admin" | "admin";
export const COOKIE = "thc_session";

export interface SessionPayload {
  uid: number;
  username: string;
  role: Role;
  mc: boolean; // must change password
  exp: number;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function verifySessionEdge(
  token: string | undefined | null,
  secret: string | undefined,
): Promise<SessionPayload | null> {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlToBytes(sig) as BufferSource,
      new TextEncoder().encode(body),
    );
    if (!ok) return null;
    const json = new TextDecoder().decode(b64urlToBytes(body));
    const p = JSON.parse(json) as SessionPayload;
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}
