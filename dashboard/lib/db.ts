import "server-only";
import { join } from "node:path";
import Database from "better-sqlite3";

// The dashboard reads the SAME queue the bot writes: ../data/thc-bot.sqlite
const DB_PATH = process.env.THC_DB_PATH || join(process.cwd(), "..", "data", "thc-bot.sqlite");

export type LeadStatus = "pending" | "approved" | "rejected" | "published";

export interface QueuedLead {
  id: number;
  title: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  timezone: string | null;
  location: string | null;
  lumaUrl: string | null;
  otherUrl: string | null;
  host: string | null;
  confidence: number;
  sourceChat: string;
  sourceMsgId: string;
  sourceText: string;
  status: LeadStatus;
  publishedUrl: string | null;
  createdAt: string;
}

let _db: Database.Database | null = null;
function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH, { fileMustExist: false });
  _db.pragma("journal_mode = WAL");
  // Mirror the bot's schema so the dashboard works even before the first ingest.
  _db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupeKey TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL,
      startDate TEXT, endDate TEXT, timezone TEXT, location TEXT,
      lumaUrl TEXT, otherUrl TEXT, host TEXT, confidence REAL NOT NULL,
      sourceChat TEXT NOT NULL, sourceMsgId TEXT NOT NULL, sourceText TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', publishedUrl TEXT, createdAt TEXT NOT NULL
    );`);
  const cols = _db.prepare("PRAGMA table_info(leads)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "rejectedAt")) {
    _db.exec("ALTER TABLE leads ADD COLUMN rejectedAt TEXT");
  }
  return _db;
}

export function listLeads(status?: LeadStatus): QueuedLead[] {
  return (
    status
      ? db().prepare("SELECT * FROM leads WHERE status=? ORDER BY confidence DESC, id DESC").all(status)
      : db().prepare("SELECT * FROM leads ORDER BY id DESC").all()
  ) as QueuedLead[];
}

export function getLead(id: number): QueuedLead | undefined {
  return db().prepare("SELECT * FROM leads WHERE id=?").get(id) as QueuedLead | undefined;
}

export function setStatus(id: number, status: LeadStatus, publishedUrl?: string): void {
  db()
    .prepare(
      `UPDATE leads SET status=@status,
         publishedUrl=COALESCE(@pub, publishedUrl),
         rejectedAt=CASE WHEN @status='rejected' THEN @now ELSE rejectedAt END
       WHERE id=@id`,
    )
    .run({ status, pub: publishedUrl ?? null, now: new Date().toISOString(), id });
}

/** Delete rejected leads older than `days` (keyed on rejection time, else createdAt). */
export function purgeOldRejects(days = 30): number {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  return db()
    .prepare("DELETE FROM leads WHERE status='rejected' AND COALESCE(rejectedAt, createdAt) < ?")
    .run(cutoff).changes;
}

export interface Stats {
  pending: number;
  approved: number;
  published: number;
  rejected: number;
  total: number;
}
export function stats(): Stats {
  const rows = db().prepare("SELECT status, COUNT(*) n FROM leads GROUP BY status").all() as {
    status: LeadStatus;
    n: number;
  }[];
  const s: Stats = { pending: 0, approved: 0, published: 0, rejected: 0, total: 0 };
  for (const r of rows) {
    (s as any)[r.status] = r.n;
    s.total += r.n;
  }
  return s;
}
