"use client";

import { motion } from "motion/react";
import type { QueuedLead } from "@/lib/db";

type Action = "publish" | "approve" | "reject";

const CalIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" />
  </svg>
);
const PinIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" />
  </svg>
);
const UserIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
  </svg>
);

function fmtDate(iso: string | null): string {
  if (!iso) return "Date TBD";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  published: "Published",
  rejected: "Rejected",
  pending: "Pending",
};

export default function LeadCard({
  lead,
  onAction,
  busy,
}: {
  lead: QueuedLead;
  onAction: (id: number, action: Action) => void;
  busy: boolean;
}) {
  const url = lead.lumaUrl || lead.otherUrl;
  const pct = Math.round(lead.confidence * 100);
  return (
    <motion.article
      layout
      className="card"
      initial={{ opacity: 0, y: 26, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96, transition: { duration: 0.28 } }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
    >
      <div className="card-top">
        <h3 className="font-display">{lead.title}</h3>
        <span className="conf" title={`${pct}% confidence`}>
          <span className="bar">
            <i style={{ width: `${pct}%` }} />
          </span>
          {pct}%
        </span>
      </div>

      <div className="meta">
        <span>
          <CalIcon /> {fmtDate(lead.startDate)}
          {lead.timezone ? ` · ${lead.timezone}` : ""}
        </span>
        {lead.location && (
          <span>
            <PinIcon /> {lead.location}
          </span>
        )}
        {lead.host && (
          <span>
            <UserIcon /> {lead.host}
          </span>
        )}
      </div>

      <p className="desc">{lead.description}</p>

      {url && (
        <a className="link" href={url} target="_blank" rel="noopener noreferrer">
          {url.replace(/^https?:\/\//, "")} ↗
        </a>
      )}

      <details className="src">
        <summary>Source · {lead.sourceChat}</summary>
        <pre>{lead.sourceText}</pre>
      </details>

      <div className="actions">
        {lead.status === "pending" && (
          <>
            <button className="btn primary" disabled={busy} onClick={() => onAction(lead.id, "publish")}>
              Approve &amp; Publish to Luma
            </button>
            <button className="btn" disabled={busy} onClick={() => onAction(lead.id, "approve")}>
              Approve only
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => onAction(lead.id, "reject")}>
              Reject
            </button>
          </>
        )}

        {lead.status === "approved" &&
          (lead.lumaUrl ? (
            <>
              <button className="btn primary" disabled={busy} onClick={() => onAction(lead.id, "publish")}>
                Publish to Luma
              </button>
              <button className="btn ghost" disabled={busy} onClick={() => onAction(lead.id, "reject")}>
                Reject
              </button>
            </>
          ) : (
            <span className="hint">No Luma link — can’t add to calendar.</span>
          ))}

        {lead.status === "published" && (
          <>
            <span className="conf" style={{ borderColor: "var(--border-strong)" }}>
              {STATUS_LABEL.published}
            </span>
            {lead.publishedUrl && (
              <a className="link" href={lead.publishedUrl} target="_blank" rel="noopener noreferrer">
                View on Luma ↗
              </a>
            )}
            {lead.lumaUrl && (
              <button className="btn ghost" disabled={busy} onClick={() => onAction(lead.id, "publish")}>
                Re-publish
              </button>
            )}
          </>
        )}

        {lead.status === "rejected" && (
          <span className="conf" style={{ borderColor: "var(--border-strong)" }}>
            {STATUS_LABEL.rejected}
          </span>
        )}
      </div>
    </motion.article>
  );
}
