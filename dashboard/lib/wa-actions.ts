import "server-only";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { readSettings } from "./settings";

const execFileP = promisify(execFile);

const WACLI_BIN = process.env.WACLI_BIN || "wacli";
const BROKER_PORT = process.env.WA_WEBHOOK_PORT || "4610";
const TOKEN_PATH =
  process.env.THC_ACTION_TOKEN_PATH || join(process.cwd(), "..", "data", ".action-token");

/** Throws unless the operator has explicitly enabled destructive moderation actions. */
export function assertActionsEnabled(): void {
  if (!readSettings().moderationActionsEnabled) {
    throw new Error("Moderation actions are disabled. Enable them in Settings first.");
  }
}

function requireArg(name: string, v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) throw new Error(`Missing ${name}. Re-scan the chat so the flag records it.`);
  return s;
}

function readToken(): string | null {
  try {
    const t = readFileSync(TOKEN_PATH, "utf8").trim();
    return t || null;
  } catch {
    return null; // bot not running, or it never wrote one
  }
}

/**
 * Ask the bot to perform the action.
 *
 * The bot owns `wacli sync --follow`, which holds wacli's exclusive store lock for
 * its whole lifetime — so a write issued from here would just fail with "store is
 * locked". The bot's broker stops sync, runs the command, and restarts sync.
 * Returns false if the bot isn't reachable, so the caller can fall back.
 */
async function viaBroker(body: Record<string, string>): Promise<boolean> {
  const token = readToken();
  if (!token) return false;
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${BROKER_PORT}/action`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000), // sync stop + command + restart
    });
  } catch {
    return false; // nothing listening; treat as "bot not running"
  }
  if (res.ok) return true;
  const j = await res.json().catch(() => ({}) as any);
  // 401 means our token is stale — fall back rather than reporting a confusing error.
  if (res.status === 401) return false;
  throw new Error(j?.error || `broker returned ${res.status}`);
}

/**
 * Direct wacli write, used only when the bot isn't running (nothing holds the lock).
 * This is the one place in the dashboard that drops WACLI_READONLY.
 */
async function directWrite(args: string[]): Promise<void> {
  const env = { ...process.env };
  delete env.WACLI_READONLY;
  const { stdout } = await execFileP(WACLI_BIN, [...args, "--lock-wait", "10s", "--json"], {
    env,
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const out = stdout.trim();
  try {
    const v = JSON.parse(out);
    if (v && v.success === false) throw new Error(`wacli: ${v.error ?? "unknown error"}`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("wacli:")) throw e;
  }
}

/**
 * Delete a flagged message for everyone in the chat. Requires the bot account to
 * be a group admin. Irreversible.
 */
export async function deleteMessage(chat: string, msgId: string): Promise<void> {
  assertActionsEnabled();
  const c = requireArg("chat", chat);
  const id = requireArg("message id", msgId);
  if (await viaBroker({ op: "delete", chat: c, msgId: id })) return;
  await directWrite(["messages", "delete", "--chat", c, "--id", id]);
}

/**
 * Remove a participant from a group. Requires the bot account to be a group
 * admin. Irreversible — the person must be re-invited manually.
 */
export async function removeParticipant(groupJid: string, user: string): Promise<void> {
  assertActionsEnabled();
  const jid = requireArg("group JID", groupJid);
  if (!jid.endsWith("@g.us")) throw new Error(`Not a group JID: ${jid}`);
  const u = requireArg("sender JID", user);
  if (await viaBroker({ op: "remove", groupJid: jid, user: u })) return;
  await directWrite(["groups", "participants", "remove", "--jid", jid, "--user", u]);
}
