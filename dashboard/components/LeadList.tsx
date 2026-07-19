"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { QueuedLead, Stats } from "@/lib/db";
import LeadCard from "./LeadCard";
import { useConsole } from "./ConsoleProvider";

type Action = "publish" | "approve" | "reject";
type Filter = "pending" | "approved" | "published" | "rejected" | "all";

const FILTERS: Filter[] = ["pending", "approved", "published", "rejected", "all"];

export default function LeadList({
  showFilters = false,
  status = "pending",
}: {
  showFilters?: boolean;
  status?: Filter;
}) {
  const [filter, setFilter] = useState<Filter>(status);
  const [leads, setLeads] = useState<QueuedLead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { stream } = useConsole();

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/leads?status=${filter}`, { cache: "no-store" });
    const j = await r.json();
    setLeads(j.leads);
    setStats(j.stats);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  async function publishWithConsole(id: number) {
    const lead = leads.find((l) => l.id === id);
    setBusyId(id);
    try {
      await stream({ title: `Publishing · ${lead?.title || `#${id}`}`, url: "/api/publish", body: { id } });
    } finally {
      setBusyId(null);
      load();
    }
  }

  async function onAction(id: number, action: Action) {
    if (action === "publish") return publishWithConsole(id);
    setBusyId(id);
    try {
      const r = await fetch("/api/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const j = await r.json();
      if (!j.ok) return setToast(j.error || "Action failed");
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setToast(action === "approve" ? "Approved." : "Rejected.");
    } catch (e) {
      setToast(String((e as Error).message));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {showFilters && (
        <div className="filters">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`chip${filter === f ? " on" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f[0].toUpperCase() + f.slice(1)}
              {stats && f !== "all" ? ` · ${(stats as any)[f] ?? 0}` : ""}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="mono">Loading…</p>
      ) : leads.length === 0 ? (
        <motion.div className="empty" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="big font-display">Nothing here.</div>
          <p>No {filter === "all" ? "" : filter} leads. Run the bot to pull fresh events.</p>
        </motion.div>
      ) : (
        <AnimatePresence mode="popLayout">
          {leads.map((l) => (
            <LeadCard key={l.id} lead={l} busy={busyId === l.id} onAction={onAction} />
          ))}
        </AnimatePresence>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
