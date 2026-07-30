"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IReview, IEvents, IChat, ILuma, ISettings, IUsers, ILogout } from "./icons";
import { useToast } from "./ToastProvider";

type Role = "super_admin" | "admin";
interface Me {
  username: string;
  role: Role;
}

const NAV = [
  { href: "/", label: "Review", Icon: IReview, group: "Curate" },
  { href: "/events", label: "All events", Icon: IEvents, group: "Curate" },
  { href: "/groups", label: "WhatsApp", Icon: IChat, group: "Sources" },
  { href: "/luma", label: "Luma", Icon: ILuma, group: "Sources" },
  { href: "/users", label: "Admins", Icon: IUsers, group: "System", superAdmin: true },
  { href: "/settings", label: "Settings", Icon: ISettings, group: "System" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [waOk, setWaOk] = useState<boolean | null>(null);
  const [autoScan, setAutoScan] = useState<boolean | null>(null);
  const waWasOk = useRef<boolean | null>(null); // to toast only on the transition into offline

  // The login and change-password screens render without the app chrome.
  const bare = path === "/login" || path === "/change-password";

  useEffect(() => {
    if (bare) return;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setMe(j?.user ?? null))
      .catch(() => {});
  }, [bare, path]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  // Ensure the auto-scan watcher (wacli sync --follow + periodic scan) is running. Once, on load.
  useEffect(() => {
    if (bare) return;
    fetch("/api/watch", { method: "POST" })
      .then((r) => r.json())
      .then((j) => setAutoScan(!!j.running))
      .catch(() => setAutoScan(false));
  }, [bare]);

  useEffect(() => {
    if (bare) return;
    let alive = true;
    const load = () => {
      fetch("/api/leads?status=pending")
        .then((r) => r.json())
        .then((j) => alive && setPending(j.stats?.pending ?? 0))
        .catch(() => {});
      fetch("/api/wa/status")
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          const ok = !!j.reachable;
          setWaOk(ok);
          // Announce only on the healthy→offline edge, with the underlying reason.
          if (!ok && waWasOk.current) {
            toast(
              `WhatsApp disconnected: ${j.error || "not reachable"}. Check wacli auth/sync.`,
              "error",
            );
          }
          waWasOk.current = ok;
        })
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
  }, [path, bare, toast]);

  if (bare) return <>{children}</>;

  const nav = NAV.filter((n) => !n.superAdmin || me?.role === "super_admin");
  let lastGroup = "";
  return (
    <>
      <div className="backdrop" />
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="mark">
              <img src="/thc-logo.png" alt="The Hack Collective" width={34} height={34} />
            </div>
            <div className="who">
              THC Bot
              <small>Lead Console</small>
            </div>
          </div>

          {nav.map((n) => {
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
            {me && (
              <div className="user-foot">
                <div className="user-who">
                  <span className="user-name">{me.username}</span>
                  <span className={`role-tag ${me.role}`}>
                    {me.role === "super_admin" ? "super admin" : "admin"}
                  </span>
                </div>
                <button className="logout-btn" onClick={logout} title="Sign out">
                  <ILogout /> Sign out
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className="main">{children}</main>
      </div>
    </>
  );
}
