import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { WaChat, WaMessage } from "../types.js";
import { normalizeChat, normalizeMessage, parseJsonOutput } from "./wacli-parse.js";

const execFileP = promisify(execFile);

const WACLI_BIN = process.env.WACLI_BIN || "wacli";

// Parsing/normalization lives in ./wacli-parse.ts so the dashboard shares it.
export { normalizeChat, normalizeMessage, parseJsonOutput } from "./wacli-parse.js";

/**
 * Run wacli in read-only mode with --json and parse its output.
 * wacli emits human progress on stderr, data on stdout (per docs), so stdout
 * is either a JSON array or newline-delimited JSON. parseJsonOutput handles both.
 */
async function wacli(args: string[]): Promise<any[]> {
  const { stdout } = await execFileP(WACLI_BIN, [...args, "--json"], {
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, WACLI_READONLY: "1" },
  });
  return parseJsonOutput(stdout);
}

export async function listGroups(filterNames: string[] = []): Promise<WaChat[]> {
  // chats list defaults to --limit 50; raise it so busy accounts don't drop groups.
  const rows = await wacli(["chats", "list", "--limit", "1000"]);
  let groups = rows.map(normalizeChat).filter((c) => c.isGroup);

  if (filterNames.length) {
    const want = filterNames.map((n) => n.toLowerCase());
    groups = groups.filter(
      (c) => want.includes(c.name.toLowerCase()) || want.includes(c.jid.toLowerCase()),
    );
    // Explicit JIDs may not appear in chats list (unsynced metadata) but still
    // have readable messages — scan them directly.
    const found = new Set(groups.map((g) => g.jid.toLowerCase()));
    for (const n of filterNames) {
      if (n.endsWith("@g.us") && !found.has(n.toLowerCase())) {
        groups.push({ jid: n, name: n, isGroup: true });
      }
    }
  }
  return groups;
}

export async function fetchMessages(
  chat: WaChat,
  afterIso: string,
  limit = 2000,
): Promise<WaMessage[]> {
  // Full RFC3339, not a bare date: wacli treats --after as strictly-greater, so the
  // cursor skips exactly what we've already seen. Truncating to the day made every
  // scan re-read the whole day and re-create flags that had been cleared.
  const after = afterIso;
  const rows = await wacli([
    "messages",
    "list",
    "--chat",
    chat.jid,
    "--after",
    after,
    "--asc",
    "--limit",
    String(limit),
  ]);
  return rows.map((r) => normalizeMessage(r, chat.name)).filter((m) => m.text.trim());
}
