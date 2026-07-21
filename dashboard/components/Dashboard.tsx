"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import gsap from "gsap";
import type { QueuedLead, Stats } from "@/lib/db";
import LeadCard from "./LeadCard";

type Action = "publish" | "approve" | "reject";

export default function Dashboard({
  initialLeads,
  initialStats,
}: {
  initialLeads: QueuedLead[];
  initialStats: Stats;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [stats, setStats] = useState(initialStats);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // GSAP intro: stagger the header + stat tiles in.
  useEffect(() => {
    const ctx = gsap.context(() => {
      // set→to (not from) + clearProps: survives StrictMode double-mount without
      // leaving elements stranded at opacity 0.
      gsap.set("[data-reveal]", { y: 24, opacity: 0 });
      gsap.to("[data-reveal]", {
        y: 0,
        opacity: 1,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.08,
        clearProps: "opacity,transform",
      });
    }, headerRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  async function onAction(id: number, action: Action) {
    setBusyId(id);
    try {
      const r = await fetch("/api/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const j = await r.json();
      if (!j.ok) {
        setToast(j.error || "Action failed");
        return;
      }
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setStats((s) => ({
        ...s,
        pending: Math.max(0, s.pending - 1),
        approved: action !== "reject" ? s.approved + 1 : s.approved,
        rejected: action === "reject" ? s.rejected + 1 : s.rejected,
      }));
      setToast(
        action === "publish"
          ? "Publishing to Luma — a browser window will open."
          : action === "approve"
            ? "Approved."
            : "Rejected.",
      );
    } catch (e) {
      setToast(String((e as Error).message));
    } finally {
      setBusyId(null);
    }
  }

  const statTiles: { k: keyof Stats; label: string; accent?: boolean }[] = [
    { k: "pending", label: "Pending", accent: true },
    { k: "approved", label: "Approved" },
    { k: "published", label: "Published" },
    { k: "total", label: "Total seen" },
  ];

  return (
    <main className="shell">
      <div ref={headerRef}>
        <span className="eyebrow" data-reveal>
          <img className="eyebrow-mark" src="/thc-logo.png" alt="" width={14} height={14} />{" "}
          The Hack Collective
        </span>
        <h1 className="title font-display" data-reveal>
          Event leads, <em>curated</em>
          <br />
          for the calendar.
        </h1>
        <p className="lede" data-reveal>
          Pulled from WhatsApp, distilled by the model. Approve what belongs on the Luma
          calendar — one tap ships it.
        </p>

        <section className="stats">
          {statTiles.map((t) => (
            <div className={`stat${t.accent ? " accent" : ""}`} key={t.k} data-reveal>
              <div className="n font-display">{stats[t.k]}</div>
              <div className="l">{t.label}</div>
            </div>
          ))}
        </section>
      </div>

      <div className="section-head">
        <h2>Awaiting review</h2>
        <span className="count">
          {leads.length} lead{leads.length === 1 ? "" : "s"}
        </span>
      </div>

      {leads.length === 0 ? (
        <motion.div
          className="empty"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="big font-display">All clear.</div>
          <p>No leads waiting. Run the bot to pull fresh events, then refresh.</p>
        </motion.div>
      ) : (
        <AnimatePresence mode="popLayout">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onAction={onAction} busy={busyId === lead.id} />
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
    </main>
  );
}
