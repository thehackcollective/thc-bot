"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { gsap } from "gsap";

// The WebGL scene is client-only and heavy, so load it lazily with no SSR.
const LoginScene = dynamic(() => import("@/components/LoginScene"), { ssr: false });

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  // Stagger the form + brand copy in on mount.
  useEffect(() => {
    if (!formRef.current) return;
    const items = formRef.current.querySelectorAll("[data-anim]");
    gsap.from(items, { opacity: 0, y: 18, duration: 0.6, stagger: 0.08, ease: "power3.out" });
  }, []);

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
      // Force the password change before honouring any deep link.
      if (j.user?.mustChangePassword) {
        router.push("/change-password");
        router.refresh();
        return;
      }
      const next = params.get("next") || "/";
      router.push(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-split">
      {/* Left: brand + WebGL backdrop */}
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
      <main className="auth-form" ref={formRef}>
        <form className="auth-card" onSubmit={submit}>
          <h1 data-anim>Welcome back</h1>
          <p className="login-sub" data-anim>
            Sign in to the lead console.
          </p>

          <div className="field" data-anim>
            <label>Username</label>
            <input
              type="text"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="field" data-anim>
            <label>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {err && <p className="login-err" data-anim>⚠ {err}</p>}

          <button type="submit" className="login-btn" data-anim disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}
