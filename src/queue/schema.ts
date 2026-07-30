import type { Database } from "better-sqlite3";

/**
 * Canonical SQLite schema for the review queue.
 *
 * Both the bot and the dashboard open the SAME database file, so this is the single
 * place the layout is defined — previously each side ran its own CREATE TABLE and
 * ALTER TABLE migrations, which let them drift. Import this from both.
 *
 * Type-only import of better-sqlite3 keeps this module runtime-dependency-free.
 */
export const SCHEMA_SQL = `
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
`;

/** Idempotent ALTER — adds a column only if the table doesn't already have it. */
export function ensureColumn(db: Database, table: string, col: string, decl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
}

/**
 * Create tables and apply additive migrations. Safe to call on every connection
 * (both processes do), and safe to run concurrently.
 */
export function applySchema(db: Database): void {
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  ensureColumn(db, "leads", "rejectedAt", "TEXT"); // when a lead was rejected; drives the 30-day purge
}
