import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { config } from "../config.js";
import type { LeadStatus, QueuedLead } from "../types.js";
import type { ExtractedLead } from "../extract/events.js";

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (_db) return _db;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  _db = new Database(config.dbPath);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupeKey TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      startDate TEXT,
      endDate TEXT,
      timezone TEXT,
      location TEXT,
      lumaUrl TEXT,
      otherUrl TEXT,
      host TEXT,
      confidence REAL NOT NULL,
      sourceChat TEXT NOT NULL,
      sourceMsgId TEXT NOT NULL,
      sourceText TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      publishedUrl TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cursors (
      chatJid TEXT PRIMARY KEY,
      lastTs TEXT NOT NULL
    );
  `);
  ensureColumn(_db, "leads", "rejectedAt", "TEXT"); // when a lead was rejected; drives 30-day purge
  return _db;
}

/** Idempotent ALTER — adds a column only if the table doesn't already have it. */
function ensureColumn(d: Database.Database, table: string, col: string, decl: string): void {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === col)) d.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
}

function normalizeUrl(u: string | null): string | null {
  if (!u) return null;
  return u.trim().replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
}

export function dedupeKey(l: {
  lumaUrl: string | null;
  otherUrl: string | null;
  title: string;
  startDate: string | null;
}): string {
  const url = normalizeUrl(l.lumaUrl) || normalizeUrl(l.otherUrl);
  if (url) return `url:${url}`;
  const day = (l.startDate || "").slice(0, 10);
  return `td:${l.title.trim().toLowerCase()}|${day}`;
}

/** Insert new leads; skip ones whose dedupeKey already exists. Returns inserted count. */
export function upsertLeads(leads: ExtractedLead[], nowIso: string): number {
  const stmt = db().prepare(`
    INSERT OR IGNORE INTO leads
      (dedupeKey,title,description,startDate,endDate,timezone,location,lumaUrl,otherUrl,host,confidence,sourceChat,sourceMsgId,sourceText,status,createdAt)
    VALUES
      (@dedupeKey,@title,@description,@startDate,@endDate,@timezone,@location,@lumaUrl,@otherUrl,@host,@confidence,@sourceChat,@sourceMsgId,@sourceText,'pending',@createdAt)
  `);
  const tx = db().transaction((rows: ExtractedLead[]) => {
    let n = 0;
    for (const l of rows) {
      const r = stmt.run({ ...l, dedupeKey: dedupeKey(l), createdAt: nowIso });
      n += r.changes;
    }
    return n;
  });
  return tx(leads);
}

export function listLeads(status?: LeadStatus): QueuedLead[] {
  const rows = status
    ? db().prepare("SELECT * FROM leads WHERE status = ? ORDER BY confidence DESC, id DESC").all(status)
    : db().prepare("SELECT * FROM leads ORDER BY id DESC").all();
  return rows as QueuedLead[];
}

export function getLead(id: number): QueuedLead | undefined {
  return db().prepare("SELECT * FROM leads WHERE id = ?").get(id) as QueuedLead | undefined;
}

export function setStatus(id: number, status: LeadStatus, publishedUrl?: string): void {
  db()
    .prepare(
      `UPDATE leads SET status = @status,
         publishedUrl = COALESCE(@pub, publishedUrl),
         rejectedAt = CASE WHEN @status = 'rejected' THEN @now ELSE rejectedAt END
       WHERE id = @id`,
    )
    .run({ status, pub: publishedUrl ?? null, now: new Date().toISOString(), id });
}

/** Delete rejected leads older than `days` (keyed on rejection time, falling back to createdAt). */
export function purgeOldRejects(days = 30): number {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const r = db()
    .prepare(
      "DELETE FROM leads WHERE status = 'rejected' AND COALESCE(rejectedAt, createdAt) < ?",
    )
    .run(cutoff);
  return r.changes;
}

export function getCursor(chatJid: string): string | null {
  const r = db().prepare("SELECT lastTs FROM cursors WHERE chatJid = ?").get(chatJid) as
    | { lastTs: string }
    | undefined;
  return r?.lastTs ?? null;
}

export function setCursor(chatJid: string, lastTs: string): void {
  db()
    .prepare("INSERT INTO cursors (chatJid,lastTs) VALUES (?,?) ON CONFLICT(chatJid) DO UPDATE SET lastTs = excluded.lastTs")
    .run(chatJid, lastTs);
}
