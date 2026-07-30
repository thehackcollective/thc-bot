"use client";

import { useEffect, useState } from "react";
import type { Stats } from "@/lib/db";
import LeadList from "@/components/LeadList";
import { useConsole } from "@/components/ConsoleProvider";

export default function ReviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [running, setRunning] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { stream } = useConsole();

  function loadStats() {
    fetch("/api/leads?status=all")
      .then((r) => r.json())
      .then((j) => setStats(j.stats))
      .catch(() => {});
  }

  useEffect(loadStats, []);

  async function runBot() {
    setRunning(true);
    try {
      await stream({ title: "Pull new events", url: "/api/run" });
    } finally {
      setRunning(false);
      loadStats();
      setRefreshKey((k) => k + 1); // remount LeadList to show freshly-queued leads
    }
  }

  const tiles: { k: keyof Stats; label: string; accent?: boolean }[] = [
    { k: "pending", label: "Pending", accent: true },
    { k: "approved", label: "Approved" },
    { k: "published", label: "Published" },
    { k: "total", label: "Total seen" },
  ];

  return (
    <>
      <div className="page-head">
        <h1>Review queue</h1>
        <p>
          Event leads pulled from WhatsApp and distilled by the model. Approve what belongs on
          the Luma calendar — one tap ships it.
        </p>
      </div>

      <section className="stats">
        {tiles.map((t) => (
          <div className={`stat${t.accent ? " accent" : ""}`} key={t.k}>
            <div className="n font-display">{stats ? stats[t.k] : "—"}</div>
            <div className="l">{t.label}</div>
          </div>
        ))}
      </section>

      <div className="section-head">
        <h2>Awaiting review</h2>
        <button className="btn" onClick={runBot} disabled={running}>
          {running ? "Running…" : "↻ Pull new events"}
        </button>
      </div>

      <LeadList key={refreshKey} status="pending" />
    </>
  );
}
