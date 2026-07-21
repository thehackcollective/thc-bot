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

// --- Moderation flags (scam/spam beta) ---

export type FlagStatus = "pending" | "confirmed" | "dismissed";

export interface QueuedFlag {
  id: number;
  category: "scam" | "spam";
  confidence: number;
  reason: string;
  signals: string;
  sender: string;
  senderJid: string | null;
  msgTimestamp: string;
  sourceChat: string;
  chatJid: string | null;
  sourceMsgId: string;
  sourceText: string;
  status: FlagStatus;
  createdAt: string;
  actionTaken: string | null;
  actionAt: string | null;
  actionError: string | null;
}

function ensureFlags(): void {
  const d = db();
  d.exec(`
    CREATE TABLE IF NOT EXISTS flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sourceMsgId TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL, confidence REAL NOT NULL, reason TEXT NOT NULL, signals TEXT NOT NULL,
      sender TEXT NOT NULL, senderJid TEXT, msgTimestamp TEXT NOT NULL,
      sourceChat TEXT NOT NULL, chatJid TEXT, sourceText TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      actionTaken TEXT, actionAt TEXT, actionError TEXT,
      createdAt TEXT NOT NULL
    );`);
  // Mirror the bot's migrations for DBs created before moderation actions existed.
  const cols = new Set(
    (d.prepare("PRAGMA table_info(flags)").all() as { name: string }[]).map((c) => c.name),
  );
  for (const col of ["senderJid", "chatJid", "actionTaken", "actionAt", "actionError"]) {
    if (!cols.has(col)) d.exec(`ALTER TABLE flags ADD COLUMN ${col} TEXT`);
  }
}

export function listFlags(status?: FlagStatus): QueuedFlag[] {
  ensureFlags();
  return (
    status
      ? db().prepare("SELECT * FROM flags WHERE status=? ORDER BY confidence DESC, id DESC").all(status)
      : db().prepare("SELECT * FROM flags ORDER BY id DESC").all()
  ) as QueuedFlag[];
}

export function setFlagStatus(id: number, status: FlagStatus): void {
  ensureFlags();
  db().prepare("UPDATE flags SET status=? WHERE id=?").run(status, id);
}

/**
 * Delete flags from the local queue — the review record only, nothing on WhatsApp.
 * Pass a status to clear just that bucket, or nothing to clear all. Ingest cursors
 * are left alone on purpose: the bot won't re-flag messages it has already passed.
 */
export function clearFlags(status?: FlagStatus): number {
  ensureFlags();
  const n = status
    ? db().prepare("DELETE FROM flags WHERE status=?").run(status).changes
    : db().prepare("DELETE FROM flags").run().changes;
  // Restart ids from 1 once the table is empty; keeps the queue readable.
  const left = (db().prepare("SELECT COUNT(*) n FROM flags").get() as { n: number }).n;
  if (!left) db().prepare("DELETE FROM sqlite_sequence WHERE name = ?").run("flags");
  return n;
}

export function getFlag(id: number): QueuedFlag | undefined {
  ensureFlags();
  return db().prepare("SELECT * FROM flags WHERE id=?").get(id) as QueuedFlag | undefined;
}

/** Record the outcome of a WhatsApp-side action. `error` null means it succeeded. */
export function recordFlagAction(id: number, action: string, error: string | null): void {
  ensureFlags();
  const prev = getFlag(id)?.actionTaken;
  const taken = error
    ? (prev ?? null)
    : [...new Set([...(prev ? prev.split(",") : []), action])].join(",");
  db()
    .prepare("UPDATE flags SET actionTaken=?, actionAt=?, actionError=? WHERE id=?")
    .run(taken, new Date().toISOString(), error, id);
}

export function flagStats(): { pending: number; confirmed: number; dismissed: number; total: number } {
  ensureFlags();
  const rows = db().prepare("SELECT status, COUNT(*) n FROM flags GROUP BY status").all() as {
    status: FlagStatus;
    n: number;
  }[];
  const s = { pending: 0, confirmed: 0, dismissed: 0, total: 0 };
  for (const r of rows) {
    (s as any)[r.status] = r.n;
    s.total += r.n;
  }
  return s;
}
