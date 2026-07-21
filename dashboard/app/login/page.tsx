"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";

// Canvas backdrop is client-only; skip SSR.
const LoginScene = dynamic(() => import("@/components/LoginScene"), { ssr: false });

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setErr(j.error || "Login failed");
        return;
      }
      if (j.user?.mustChangePassword) {
        router.push("/change-password");
        router.refresh();
        return;
      }
      const next = params.get("next") || "/";
      router.push(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      setErr(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-split">
      {/* Left: brand + pixelated canvas backdrop */}
      <aside className="auth-brand">
        <div className="auth-scene">
          <LoginScene />
        </div>
        <div className="auth-brand-copy">
          <img src="/thc-logo.png" alt="The Hack Collective" width={52} height={52} />
          <h2>The Hack Collective</h2>
          <p>
            WhatsApp chatter in, a curated Luma calendar out. Sign in to review the events the bot
            found and decide what ships.
          </p>
        </div>
      </aside>

      {/* Right: sign-in form */}
      <main className="auth-form">
        <form className="auth-card" onSubmit={submit}>
          <h1>Welcome back</h1>
          <p className="login-sub">Sign in to the lead console.</p>

          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {err && <p className="login-err">⚠ {err}</p>}

          <button type="submit" className="login-btn" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}
