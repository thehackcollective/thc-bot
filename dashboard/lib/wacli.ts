import "server-only";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const BIN = process.env.WACLI_BIN || "wacli";

function parse(stdout: string): any {
  const t = stdout.trim();
  if (!t) return null;
  const v = JSON.parse(t);
  if (v && v.success === false) throw new Error(v.error || "wacli error");
  return v?.data ?? v;
}

async function run(args: string[], timeoutMs = 30000): Promise<any> {
  const { stdout } = await execFileP(BIN, [...args, "--json"], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
    env: { ...process.env, WACLI_READONLY: "1" },
  });
  return parse(stdout);
}

export interface WaGroup {
  jid: string;
  name: string;
  lastMessageTs: string | null;
  unread: number;
  archived: boolean;
}

export async function listGroups(): Promise<WaGroup[]> {
  const data = (await run(["chats", "list", "--limit", "1000"])) as any[];
  return (Array.isArray(data) ? data : [])
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
    // A cheap read proves the store + binary are usable.
    const chats = (await run(["chats", "list", "--limit", "1"], 8000)) as any[];
    let total: number | null = null;
    try {
      const d = await run(["store", "stats"], 8000);
      total = d?.messages ?? d?.total_messages ?? null;
    } catch {
      /* store stats shape varies; ignore */
    }
    return { reachable: Array.isArray(chats), totalMessages: total };
  } catch (e) {
    return { reachable: false, totalMessages: null, error: String((e as Error).message) };
  }
}

export async function messageCount(jid: string, sinceDays = 3650): Promise<number> {
  const after = new Date(Date.now() - sinceDays * 86400_000).toISOString().slice(0, 10);
  try {
    const d = await run(["messages", "list", "--chat", jid, "--after", after, "--limit", "5000"], 20000);
    const msgs = d?.messages ?? d ?? [];
    return Array.isArray(msgs) ? msgs.length : 0;
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
