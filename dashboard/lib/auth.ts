import "server-only";
import { join } from "node:path";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import Database from "better-sqlite3";

// Same SQLite file the rest of the dashboard uses. A second connection over WAL is fine.
const DB_PATH = process.env.THC_DB_PATH || join(process.cwd(), "..", "data", "thc-bot.sqlite");

export type Role = "super_admin" | "admin";
export const COOKIE = "thc_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export interface User {
  id: number;
  username: string;
  role: Role;
  createdAt: string;
  createdBy: string | null;
  mustChangePassword: boolean;
}
export interface SessionPayload {
  uid: number;
  username: string;
  role: Role;
  mc: boolean; // must change password before using the app
  exp: number; // epoch ms
}

let _db: Database.Database | null = null;
function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH, { fileMustExist: false });
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      createdAt TEXT NOT NULL,
      createdBy TEXT,
      mustChangePassword INTEGER NOT NULL DEFAULT 0
    );`);
  // Older DBs won't have the column; add it idempotently.
  const cols = _db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "mustChangePassword")) {
    _db.exec("ALTER TABLE users ADD COLUMN mustChangePassword INTEGER NOT NULL DEFAULT 0");
  }
  seedSuperAdmin(_db);
  return _db;
}

// Rows store mustChangePassword as 0/1; map to boolean at the boundary.
function toUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    mustChangePassword: !!row.mustChangePassword,
  };
}

// --- Password hashing (scrypt) ---

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

function verifyHash(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const derived = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// --- First-run super admin from env ---

function seedSuperAdmin(d: Database.Database): void {
  const count = (d.prepare("SELECT COUNT(*) n FROM users").get() as { n: number }).n;
  if (count > 0) return;
  const username = process.env.SUPER_ADMIN_USERNAME || "admin";
  const password = process.env.SUPER_ADMIN_PASSWORD || "changeme";
  // If no explicit password was set, the account uses a known default — force a change on
  // first login so the console is never left protected by "changeme".
  const mustChange = process.env.SUPER_ADMIN_PASSWORD ? 0 : 1;
  d.prepare(
    "INSERT INTO users (username,passwordHash,role,createdAt,createdBy,mustChangePassword) VALUES (?,?,?,?,?,?)",
  ).run(username, hashPassword(password), "super_admin", new Date().toISOString(), "system", mustChange);
  if (mustChange) {
    console.warn(
      `[auth] Seeded super admin "${username}" with default password "changeme". ` +
        "You'll be asked to set a new password on first login.",
    );
  }
}

// --- Session token (stateless, HMAC-signed) ---

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET missing or too short (need >=16 chars). Set it in dashboard/.env.local.");
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signSession(p: Omit<SessionPayload, "exp">): string {
  const payload: SessionPayload = { ...p, exp: Date.now() + SESSION_TTL_MS };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", secret()).update(body).digest());
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const p = JSON.parse(Buffer.from(body, "base64").toString("utf8")) as SessionPayload;
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = SESSION_TTL_MS / 1000;

// --- User CRUD ---

export function authenticate(username: string, password: string): User | null {
  const row = db().prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
  if (!row) return null;
  if (!verifyHash(password, row.passwordHash)) return null;
  return toUser(row);
}

export function getUser(id: number): User | undefined {
  const row = db().prepare("SELECT * FROM users WHERE id = ?").get(id);
  return row ? toUser(row) : undefined;
}

export function listUsers(): User[] {
  return (db().prepare("SELECT * FROM users ORDER BY id ASC").all() as any[]).map(toUser);
}

export function createUser(username: string, password: string, role: Role, createdBy: string): User {
  const u = username.trim();
  if (u.length < 3) throw new Error("Username must be at least 3 characters.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (db().prepare("SELECT 1 FROM users WHERE username = ?").get(u)) {
    throw new Error(`User "${u}" already exists.`);
  }
  const info = db()
    .prepare("INSERT INTO users (username,passwordHash,role,createdAt,createdBy) VALUES (?,?,?,?,?)")
    .run(u, hashPassword(password), role, new Date().toISOString(), createdBy);
  return getUser(Number(info.lastInsertRowid))!;
}

export function deleteUser(id: number): void {
  const target = getUser(id);
  if (!target) throw new Error("User not found.");
  if (target.role === "super_admin") throw new Error("The super admin cannot be deleted.");
  db().prepare("DELETE FROM users WHERE id = ?").run(id);
}

/** Verify the current password, then set a new one and clear the must-change flag. */
export function changePassword(id: number, currentPassword: string, newPassword: string): void {
  const row = db().prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
  if (!row) throw new Error("User not found.");
  if (!verifyHash(currentPassword, row.passwordHash)) throw new Error("Current password is incorrect.");
  if (newPassword.length < 8) throw new Error("New password must be at least 8 characters.");
  if (verifyHash(newPassword, row.passwordHash)) throw new Error("New password must differ from the current one.");
  db()
    .prepare("UPDATE users SET passwordHash = ?, mustChangePassword = 0 WHERE id = ?")
    .run(hashPassword(newPassword), id);
}
