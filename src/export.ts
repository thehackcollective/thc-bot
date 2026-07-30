import { mkdirSync, writeFileSync } from "node:fs";
import { config } from "./config.js";
import { listLeads } from "./queue/store.js";
import type { LeadStatus } from "./types.js";

function csvCell(s: string | number | null): string {
  const v = String(s ?? "");
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Manual-upload fallback: dump leads to CSV + Markdown for hand-entry into Luma. */
export function exportLeads(status: LeadStatus = "pending"): { csv: string; md: string } {
  const leads = listLeads(status);
  mkdirSync(config.dataDir, { recursive: true });

  const cols = ["title", "startDate", "endDate", "location", "host", "lumaUrl", "otherUrl", "description"] as const;
  const csv = [
    cols.join(","),
    ...leads.map((l) => cols.map((c) => csvCell((l as any)[c])).join(",")),
  ].join("\n");
  const csvPath = `${config.dataDir}/leads-${status}.csv`;
  writeFileSync(csvPath, csv);

  const md = leads
    .map(
      (l) =>
        `## ${l.title}\n- **When:** ${l.startDate || "?"}${l.endDate ? ` – ${l.endDate}` : ""}\n- **Where:** ${l.location || "?"}\n- **Host:** ${l.host || "?"}\n- **Link:** ${l.lumaUrl || l.otherUrl || "—"}\n\n${l.description}\n`,
    )
    .join("\n");
  const mdPath = `${config.dataDir}/leads-${status}.md`;
  writeFileSync(mdPath, md);

  console.log(`Exported ${leads.length} '${status}' lead(s):\n  ${csvPath}\n  ${mdPath}`);
  return { csv: csvPath, md: mdPath };
}
