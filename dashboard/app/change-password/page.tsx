"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (next !== confirm) return setErr("New passwords do not match.");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setErr(j.error || "Could not change password");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Set a new password</h1>
        <p className="login-sub">
          Your account still uses the default password. Choose a new one to continue.
        </p>

        <div className="field">
          <label>Current password</label>
          <input type="password" autoFocus autoComplete="current-password"
            value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="field">
          <label>New password (min 8 characters)</label>
          <input type="password" autoComplete="new-password"
            value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <input type="password" autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>

        {err && <p className="login-err">⚠ {err}</p>}

        <button type="submit" className="login-btn" disabled={busy}>
          {busy ? "Saving…" : "Save & continue"}
        </button>
      </form>
    </div>
  );
}
