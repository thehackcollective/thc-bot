import type { Database } from "better-sqlite3";
import type { ExtractedLead, LeadStatus, QueuedLead } from "../types.js";
import { dedupeKey } from "./dedupe.js";
import { applySchema } from "./schema.js";

export interface Stats {
  pending: number;
  approved: number;
  published: number;
  rejected: number;
  total: number;
}

/**
 * Queue queries, shared by the bot and the dashboard.
 *
 * Both processes talk to the same SQLite file but resolve its path differently (the
 * bot from its cwd via config, the dashboard from ../data), so the caller opens the
 * Database and binds it here. That keeps one implementation of the schema and every
 * query while leaving path and lifecycle concerns to each side.
 */
export function createLeadsRepo(db: Database) {
  applySchema(db);

  const insertLead = db.prepare(`
    INSERT OR IGNORE INTO leads
      (dedupeKey,title,description,startDate,endDate,timezone,location,lumaUrl,otherUrl,host,confidence,sourceChat,sourceMsgId,sourceText,status,createdAt)
    VALUES
      (@dedupeKey,@title,@description,@startDate,@endDate,@timezone,@location,@lumaUrl,@otherUrl,@host,@confidence,@sourceChat,@sourceMsgId,@sourceText,'pending',@createdAt)
  `);

  const insertMany = db.transaction((rows: ExtractedLead[], nowIso: string) => {
    let n = 0;
    for (const l of rows) {
      n += insertLead.run({ ...l, dedupeKey: dedupeKey(l), createdAt: nowIso }).changes;
    }
    return n;
  });

  return {
    /** Insert new leads; skip ones whose dedupeKey already exists. Returns inserted count. */
    upsertLeads(leads: ExtractedLead[], nowIso: string): number {
      return insertMany(leads, nowIso);
    },

    listLeads(status?: LeadStatus): QueuedLead[] {
      const rows = status
        ? db
            .prepare("SELECT * FROM leads WHERE status = ? ORDER BY confidence DESC, id DESC")
            .all(status)
        : db.prepare("SELECT * FROM leads ORDER BY id DESC").all();
      return rows as QueuedLead[];
    },

    getLead(id: number): QueuedLead | undefined {
      return db.prepare("SELECT * FROM leads WHERE id = ?").get(id) as QueuedLead | undefined;
    },

    setStatus(id: number, status: LeadStatus, publishedUrl?: string): void {
      db.prepare(
        `UPDATE leads SET status = @status,
           publishedUrl = COALESCE(@pub, publishedUrl),
           rejectedAt = CASE WHEN @status = 'rejected' THEN @now ELSE rejectedAt END
         WHERE id = @id`,
      ).run({ status, pub: publishedUrl ?? null, now: new Date().toISOString(), id });
    },

    /** Delete rejected leads older than `days` (keyed on rejection time, else createdAt). */
    purgeOldRejects(days = 30): number {
      const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
      return db
        .prepare("DELETE FROM leads WHERE status = 'rejected' AND COALESCE(rejectedAt, createdAt) < ?")
        .run(cutoff).changes;
    },

    stats(): Stats {
      const rows = db.prepare("SELECT status, COUNT(*) n FROM leads GROUP BY status").all() as {
        status: LeadStatus;
        n: number;
      }[];
      const s: Stats = { pending: 0, approved: 0, published: 0, rejected: 0, total: 0 };
      for (const r of rows) {
        if (r.status in s) s[r.status] = r.n;
        s.total += r.n;
      }
      return s;
    },

    getCursor(chatJid: string): string | null {
      const r = db.prepare("SELECT lastTs FROM cursors WHERE chatJid = ?").get(chatJid) as
        | { lastTs: string }
        | undefined;
      return r?.lastTs ?? null;
    },

    setCursor(chatJid: string, lastTs: string): void {
      db.prepare(
        "INSERT INTO cursors (chatJid,lastTs) VALUES (?,?) ON CONFLICT(chatJid) DO UPDATE SET lastTs = excluded.lastTs",
      ).run(chatJid, lastTs);
    },
  };
}

export type LeadsRepo = ReturnType<typeof createLeadsRepo>;
