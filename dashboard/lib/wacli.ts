import "server-only";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { parseJsonOutput } from "@bot/ingest/wacli-parse";

const execFileP = promisify(execFile);
const BIN = process.env.WACLI_BIN || "wacli";

/**
 * Always returns a row array. Uses the bot's shared parser (single source of truth)
 * which unwraps {success,data}, handles the several data shapes, and falls back to
 * NDJSON — the previous local copy was a strict JSON.parse that threw on a stray
 * wacli progress line.
 */
async function run(args: string[], timeoutMs = 30000): Promise<any[]> {
  const { stdout } = await execFileP(BIN, [...args, "--json"], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
    env: { ...process.env, WACLI_READONLY: "1" },
  });
  return parseJsonOutput(stdout);
}

export interface WaGroup {
  jid: string;
  name: string;
  lastMessageTs: string | null;
  unread: number;
  archived: boolean;
}

export async function listGroups(): Promise<WaGroup[]> {
  const rows = await run(["chats", "list", "--limit", "1000"]);
  return rows
    .filter((c) => c.kind === "group" || String(c.jid || "").endsWith("@g.us"))
    .map((c) => ({
      jid: c.jid,
      name: c.name && c.name !== c.jid ? c.name : "(unnamed group)",
      lastMessageTs: c.last_message_ts && !c.last_message_ts.startsWith("0001") ? c.last_message_ts : null,
      unread: c.unread_count || 0,
      archived: !!c.archived,
    }))
    .sort((a, b) => (b.lastMessageTs || "").localeCompare(a.lastMessageTs || ""));
}

export interface WaStatus {
  reachable: boolean;
  totalMessages: number | null;
  error?: string;
}

export async function status(): Promise<WaStatus> {
  try {
    // A cheap read proves the store + binary are usable: run() throws if wacli fails.
    await run(["chats", "list", "--limit", "1"], 8000);
    let total: number | null = null;
    try {
      // `store stats` is a single object, which the shared parser yields as a 1-row array.
      const [d] = await run(["store", "stats"], 8000);
      total = d?.messages ?? d?.total_messages ?? null;
    } catch {
      /* store stats shape varies; ignore */
    }
    return { reachable: true, totalMessages: total };
  } catch (e) {
    return { reachable: false, totalMessages: null, error: String((e as Error).message) };
  }
}

export async function messageCount(jid: string, sinceDays = 3650): Promise<number> {
  const after = new Date(Date.now() - sinceDays * 86400_000).toISOString().slice(0, 10);
  try {
    // The shared parser already unwraps data.messages, so this is the message rows.
    const rows = await run(
      ["messages", "list", "--chat", jid, "--after", after, "--limit", "5000"],
      20000,
    );
    return rows.length;
  } catch {
    return 0;
  }
}

/** Pull a wacli error message out of captured stdout/stderr. */
function extractWacliError(buf: string): string | null {
  const t = buf.trim();
  if (!t) return null;
  // wacli emits {success:false,error:"..."} as JSON; fall back to the last log line.
  for (const line of t.split("\n").reverse()) {
    const l = line.trim();
    if (!l) continue;
    try {
      const v = JSON.parse(l);
      if (v && v.success === false && v.error) return String(v.error);
    } catch {
      /* not json */
    }
    return l; // most recent human-readable line (e.g. permission/auth error)
  }
  return null;
}

/**
 * Start a backfill. The job is long-running, so we watch the first few seconds for a
 * fast failure (not authed, no admin permission, group not accessible) and report it;
 * if it's still alive after the grace window we detach and treat it as running.
 */
export function backfill(
  jid: string,
  count = 200,
  requests = 3,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        BIN,
        ["history", "backfill", "--chat", jid, "--count", String(count), "--requests", String(requests), "--wait", "40s", "--idle-exit", "10s", "--json"],
        { detached: true, stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (e) {
      resolve({ ok: false, error: String((e as Error).message) });
      return;
    }

    let buf = "";
    let settled = false;
    const done = (r: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    child.stdout?.on("data", (d) => (buf += d));
    child.stderr?.on("data", (d) => (buf += d));
    // Binary missing (ENOENT) or unspawnable.
    child.on("error", (e) => done({ ok: false, error: e.message }));
    child.on("exit", (code) => {
      if (code && code !== 0) done({ ok: false, error: extractWacliError(buf) || `wacli exited with code ${code}` });
      else done({ ok: true }); // exited cleanly within the window
    });

    // Still running after the grace window → healthy; detach and let it finish.
    setTimeout(() => {
      if (settled) return;
      child.unref();
      done({ ok: true });
    }, 3500);
  });
}
