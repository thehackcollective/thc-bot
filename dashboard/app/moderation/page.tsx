"use client";

import { useCallback, useEffect, useState } from "react";
import type { QueuedFlag } from "@/lib/db";
import { useToast } from "@/components/ToastProvider";

type Filter = "pending" | "confirmed" | "dismissed" | "all";

export default function ModerationPage() {
  const [flags, setFlags] = useState<QueuedFlag[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [busy, setBusy] = useState<number | null>(null);
  const { toast } = useToast();

  const load = useCallback(() => {
    fetch(`/api/flags?status=${filter}`)
      .then((r) => r.json())
      .then((j) => setFlags(j.flags ?? []))
      .catch(() => {});
  }, [filter]);

  useEffect(load, [load]);

  async function act(id: number, action: "confirm" | "dismiss") {
    setBusy(id);
    try {
      const r = await fetch("/api/flags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        toast(`Could not ${action}: ${j.error || "request failed"}`, "error");
        return;
      }
      toast(action === "confirm" ? "Flag confirmed" : "Flag dismissed", "ok");
      load();
    } catch (e) {
      toast(`Could not ${action}: ${String(e)}`, "error");
    } finally {
      setBusy(null);
    }
  }

  const FILTERS: Filter[] = ["pending", "confirmed", "dismissed", "all"];

  return (
    <>
      <div className="page-head">
        <h1>
          Moderation <span className="beta-tag">beta</span>
        </h1>
        <p>
          Messages the bot flagged as scam or spam. Nothing is deleted from WhatsApp — review the
          flags and confirm or dismiss. Confirming just records your call.
        </p>
      </div>

      <div className="mod-filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`chip${filter === f ? " on" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {flags.length === 0 ? (
        <p className="mod-empty">Nothing here. 🎉</p>
      ) : (
        flags.map((f) => (
          <div key={f.id} className={`mod-card ${f.category}`}>
            <div className="mod-top">
              <span className={`cat ${f.category}`}>{f.category}</span>
              <span className="conf">{(f.confidence * 100).toFixed(0)}%</span>
            </div>
            <p className="mod-reason">{f.reason || "—"}</p>
            <p className="mod-meta">
              {f.sender} · {f.sourceChat} · {new Date(f.msgTimestamp).toLocaleString()}
            </p>
            {f.signals ? <p className="mod-signals">signals: {f.signals}</p> : null}
            <details>
              <summary>message</summary>
              <pre>{f.sourceText}</pre>
            </details>
            {f.status === "pending" ? (
              <div className="mod-actions">
                <button disabled={busy === f.id} onClick={() => act(f.id, "confirm")}>
                  Confirm scam
                </button>
                <button
                  className="ghost"
                  disabled={busy === f.id}
                  onClick={() => act(f.id, "dismiss")}
                >
                  Dismiss (not spam)
                </button>
              </div>
            ) : (
              <p className="mod-status">status: {f.status}</p>
            )}
          </div>
        ))
      )}
    </>
  );
}
