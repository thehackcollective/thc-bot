"use client";

import { useCallback, useEffect, useState } from "react";
import type { QueuedFlag } from "@/lib/db";
import { useToast } from "@/components/ToastProvider";

type Filter = "pending" | "confirmed" | "dismissed" | "all";
type Action = "confirm" | "dismiss" | "delete" | "remove";

const VERB: Record<Action, string> = {
  confirm: "Flag confirmed",
  dismiss: "Flag dismissed",
  delete: "Message deleted from WhatsApp",
  remove: "Sender removed from the group",
};

export default function ModerationPage() {
  const [flags, setFlags] = useState<QueuedFlag[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [busy, setBusy] = useState<number | null>(null);
  const [actionsEnabled, setActionsEnabled] = useState(false);
  const [pending, setPending] = useState<{ id: number; action: Action } | null>(null);
  const [clearing, setClearing] = useState(false);
  const { toast } = useToast();

  const load = useCallback(() => {
    fetch(`/api/flags?status=${filter}`)
      .then((r) => r.json())
      .then((j) => {
        setFlags(j.flags ?? []);
        setActionsEnabled(Boolean(j.actionsEnabled));
      })
      .catch(() => {});
  }, [filter]);

  useEffect(load, [load]);

  async function act(id: number, action: Action) {
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
      toast(VERB[action], "ok");
      load();
    } catch (e) {
      toast(`Could not ${action}: ${String(e)}`, "error");
    } finally {
      setBusy(null);
    }
  }

  /** Clears the review queue only — the flagged WhatsApp messages are untouched. */
  async function clearQueue() {
    try {
      const r = await fetch(`/api/flags?status=${filter}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        toast(`Could not clear: ${j.error || "request failed"}`, "error");
        return;
      }
      toast(`Cleared ${j.cleared} flag${j.cleared === 1 ? "" : "s"}`, "ok");
      load();
    } catch (e) {
      toast(`Could not clear: ${String(e)}`, "error");
    } finally {
      setClearing(false);
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
          Messages the bot flagged as scam or spam. Confirm or dismiss to record your call — that
          alone changes nothing on WhatsApp.
          {actionsEnabled
            ? " WhatsApp actions are enabled: deleting a message or removing a sender is irreversible."
            : " Delete/remove actions are off; enable them in Settings."}
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
        {flags.length ? (
          <span className="mod-clear">
            {clearing ? (
              <>
                <span className="mod-confirm">
                  Clear {flags.length} {filter === "all" ? "" : `${filter} `}flag
                  {flags.length === 1 ? "" : "s"} from the queue? Nothing on WhatsApp changes.
                </span>
                <button className="danger" onClick={clearQueue}>
                  Yes, clear
                </button>
                <button className="ghost" onClick={() => setClearing(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="ghost" onClick={() => setClearing(true)}>
                Clear {filter === "all" ? "all" : filter}
              </button>
            )}
          </span>
        ) : null}
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

            {actionsEnabled ? (
              <div className="mod-actions danger">
                {/* Two-step in-page confirm rather than window.confirm(): browsers
                    suppress repeated native dialogs, which silently turned these
                    irreversible actions into no-ops. */}
                {pending?.id === f.id ? (
                  <>
                    <span className="mod-confirm">
                      {pending.action === "delete"
                        ? `Delete this message for everyone in "${f.sourceChat}"? Cannot be undone.`
                        : `Remove ${f.sender} from "${f.sourceChat}"? Cannot be undone — they must be re-invited manually.`}
                    </span>
                    <button
                      className="danger"
                      disabled={busy === f.id}
                      onClick={() => {
                        const a = pending.action;
                        setPending(null);
                        act(f.id, a);
                      }}
                    >
                      {busy === f.id ? "Working…" : `Yes, ${pending.action}`}
                    </button>
                    <button className="ghost" disabled={busy === f.id} onClick={() => setPending(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="danger"
                      disabled={
                        busy === f.id || !f.chatJid || (f.actionTaken ?? "").includes("delete")
                      }
                      title={
                        f.chatJid
                          ? "WhatsApp only allows deleting messages this account sent"
                          : "This flag predates JID tracking — re-scan the chat to enable deletion."
                      }
                      onClick={() => setPending({ id: f.id, action: "delete" })}
                    >
                      {(f.actionTaken ?? "").includes("delete")
                        ? "Message deleted"
                        : "Delete message"}
                    </button>
                    <button
                      className="danger"
                      disabled={
                        busy === f.id ||
                        !f.senderJid ||
                        !f.chatJid ||
                        (f.actionTaken ?? "").includes("remove")
                      }
                      title={
                        !f.senderJid || !f.chatJid
                          ? "This flag predates sender tracking — re-scan the chat to enable removal."
                          : undefined
                      }
                      onClick={() => setPending({ id: f.id, action: "remove" })}
                    >
                      {(f.actionTaken ?? "").includes("remove") ? "Sender removed" : "Remove sender"}
                    </button>
                  </>
                )}
              </div>
            ) : null}
            {f.actionError ? <p className="mod-error">action failed: {f.actionError}</p> : null}
          </div>
        ))
      )}
    </>
  );
}
