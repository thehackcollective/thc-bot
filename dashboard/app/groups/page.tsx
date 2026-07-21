"use client";

import { useEffect, useMemo, useState } from "react";
import type { WaGroup } from "@/lib/wacli";
import { useToast } from "@/components/ToastProvider";

type GroupFilter = "all" | "selected" | "active" | "unread" | "named";
const FILTERS: { k: GroupFilter; label: string }[] = [
  { k: "all", label: "All" },
  { k: "selected", label: "Selected" },
  { k: "active", label: "Active" },
  { k: "unread", label: "Unread" },
  { k: "named", label: "Named" },
];
const ACTIVE_DAYS = 14;

export default function GroupsPage() {
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<GroupFilter>("all");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/groups")
      .then((r) => r.json())
      .then((j) => {
        setGroups(j.groups || []);
        setSelected(j.selected || []);
        setErr(j.error || null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function persist(next: string[]) {
    setSelected(next);
    await fetch("/api/groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groups: next }),
    });
  }

  function toggle(jid: string) {
    persist(selected.includes(jid) ? selected.filter((x) => x !== jid) : [...selected, jid]);
  }

  async function backfill(jid: string) {
    toast("Backfill requested — pulling older messages from your phone.");
    try {
      const r = await fetch("/api/wa/backfill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jid }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        toast(`Backfill failed: ${j.error || "WhatsApp rejected the request"}`, "error");
      }
    } catch (e) {
      toast(`Backfill failed: ${String(e)}`, "error");
    }
  }

  const counts = useMemo(() => {
    const cutoff = Date.now() - ACTIVE_DAYS * 86400_000;
    return {
      all: groups.length,
      selected: groups.filter((g) => selected.includes(g.jid)).length,
      active: groups.filter((g) => g.lastMessageTs && new Date(g.lastMessageTs).getTime() >= cutoff).length,
      unread: groups.filter((g) => g.unread > 0).length,
      named: groups.filter((g) => g.name !== "(unnamed group)").length,
    } as Record<GroupFilter, number>;
  }, [groups, selected]);

  const shown = useMemo(() => {
    const needle = q.toLowerCase();
    const cutoff = Date.now() - ACTIVE_DAYS * 86400_000;
    const list = groups.filter((g) => {
      if (!(g.name.toLowerCase().includes(needle) || g.jid.toLowerCase().includes(needle))) return false;
      if (filter === "selected") return selected.includes(g.jid);
      if (filter === "unread") return g.unread > 0;
      if (filter === "named") return g.name !== "(unnamed group)";
      if (filter === "active") return !!g.lastMessageTs && new Date(g.lastMessageTs).getTime() >= cutoff;
      return true;
    });
    // selected first, then by recency (already sorted)
    return [...list].sort(
      (a, b) => Number(selected.includes(b.jid)) - Number(selected.includes(a.jid)),
    );
  }, [groups, q, selected, filter]);

  return (
    <>
      <div className="page-head">
        <h1>WhatsApp</h1>
        <p>Choose which group chats the bot scans for event leads. Backfill pulls older history from your linked phone when a group looks empty.</p>
      </div>

      {err && (
        <div className="panel">
          <h3>WhatsApp not reachable</h3>
          <p className="hint">
            {err}. Make sure <span className="mono">wacli</span> is authed (
            <span className="mono">wacli auth</span>) and synced (
            <span className="mono">wacli sync --follow</span>).
          </p>
        </div>
      )}

      <div className="panel">
        <div className="row" style={{ borderTop: "none", paddingTop: 0 }}>
          <div className="rl">
            <strong>{selected.length}</strong> group{selected.length === 1 ? "" : "s"} selected
            <small>Selection is saved to settings and used on the next run.</small>
          </div>
          <input
            type="text"
            placeholder="Search groups…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              background: "rgba(0,0,0,0.25)",
              border: "1px solid var(--border-strong)",
              borderRadius: 10,
              padding: "9px 12px",
              color: "var(--text)",
              width: 220,
            }}
          />
        </div>
      </div>

      <div className="filters">
        {FILTERS.map((f) => (
          <button
            key={f.k}
            className={`chip${filter === f.k ? " on" : ""}`}
            onClick={() => setFilter(f.k)}
          >
            {f.label} · {counts[f.k]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mono">Loading groups…</p>
      ) : (
        <div>
          {shown.map((g) => {
            const sel = selected.includes(g.jid);
            return (
              <div className={`grp${sel ? " sel" : ""}`} key={g.jid}>
                <div className={`toggle${sel ? " on" : ""}`} onClick={() => toggle(g.jid)} role="switch" aria-checked={sel}>
                  <span className="knob" />
                </div>
                <div>
                  <div className="gname">{g.name}</div>
                  <div className="gmeta">
                    {g.lastMessageTs ? `Active ${new Date(g.lastMessageTs).toLocaleDateString()}` : "No recent activity"}
                    {g.unread ? ` · ${g.unread} unread` : ""} · <span className="mono">{g.jid}</span>
                  </div>
                </div>
                <div className="spacer" />
                <button className="btn ghost" onClick={() => backfill(g.jid)}>
                  Backfill
                </button>
              </div>
            );
          })}
          {shown.length === 0 && <p className="mono">No groups match “{q}”.</p>}
        </div>
      )}

    </>
  );
}
