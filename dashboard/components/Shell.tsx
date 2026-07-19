"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IReview, IEvents, IChat, ILuma, ISettings } from "./icons";

const NAV = [
  { href: "/", label: "Review", Icon: IReview, group: "Curate" },
  { href: "/events", label: "All events", Icon: IEvents, group: "Curate" },
  { href: "/groups", label: "WhatsApp", Icon: IChat, group: "Sources" },
  { href: "/luma", label: "Luma", Icon: ILuma, group: "Sources" },
  { href: "/settings", label: "Settings", Icon: ISettings, group: "System" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [pending, setPending] = useState<number | null>(null);
  const [waOk, setWaOk] = useState<boolean | null>(null);
  const [autoScan, setAutoScan] = useState<boolean | null>(null);

  // Ensure the auto-scan watcher (wacli sync --follow + periodic scan) is running. Once, on load.
  useEffect(() => {
    fetch("/api/watch", { method: "POST" })
      .then((r) => r.json())
      .then((j) => setAutoScan(!!j.running))
      .catch(() => setAutoScan(false));
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/leads?status=pending")
        .then((r) => r.json())
        .then((j) => alive && setPending(j.stats?.pending ?? 0))
        .catch(() => {});
      fetch("/api/wa/status")
        .then((r) => r.json())
        .then((j) => alive && setWaOk(!!j.reachable))
        .catch(() => alive && setWaOk(false));
      fetch("/api/watch")
        .then((r) => r.json())
        .then((j) => alive && setAutoScan(!!j.running))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [path]);

  let lastGroup = "";
  return (
    <>
      <div className="backdrop" />
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="mark">H</div>
            <div className="who">
              THC Bot
              <small>Lead Console</small>
            </div>
          </div>

          {NAV.map((n) => {
            const header =
              n.group !== lastGroup ? ((lastGroup = n.group), <div className="nav-group" key={`g-${n.group}`}>{n.group}</div>) : null;
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <div key={n.href}>
                {header}
                <Link className={`nav${active ? " active" : ""}`} href={n.href}>
                  <span className="ico">
                    <n.Icon />
                  </span>
                  {n.label}
                  {n.href === "/" && pending ? <span className="badge">{pending}</span> : null}
                </Link>
              </div>
            );
          })}

          <div className="side-foot">
            <div className="pill">
              <span className={`led ${waOk ? "on" : "off"}`} />
              {waOk === null ? "Checking WhatsApp…" : waOk ? "WhatsApp connected" : "WhatsApp offline"}
            </div>
            <div className="pill">
              <span className={`led ${autoScan ? "on" : "off"}`} />
              {autoScan === null ? "Starting auto-scan…" : autoScan ? "Auto-scan on" : "Auto-scan off"}
            </div>
          </div>
        </aside>

        <main className="main">{children}</main>
      </div>
    </>
  );
}
