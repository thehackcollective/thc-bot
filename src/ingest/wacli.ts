import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { WaChat, WaMessage } from "../types.js";

const execFileP = promisify(execFile);

const WACLI_BIN = process.env.WACLI_BIN || "wacli";

/**
 * Run wacli in read-only mode with --json and parse its output.
 * wacli emits human progress on stderr, data on stdout (per docs), so stdout
 * is either a JSON array or newline-delimited JSON. We handle both.
 */
async function wacli(args: string[]): Promise<any[]> {
  const { stdout } = await execFileP(WACLI_BIN, [...args, "--json"], {
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, WACLI_READONLY: "1" },
  });
  return parseJsonOutput(stdout);
}

export function parseJsonOutput(stdout: string): any[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  // wacli wraps results in {success, data, error}. Handle that plus loose shapes.
  try {
    const v = JSON.parse(trimmed);
    if (Array.isArray(v)) return v;
    if (v && v.success === false) throw new Error(`wacli error: ${v.error ?? "unknown"}`);
    // chats list -> data: [...]; messages list -> data: { messages: [...] }.
    const d = v?.data;
    if (Array.isArray(d)) return d;
    if (d && typeof d === "object") {
      for (const k of ["messages", "chats", "items", "results"]) {
        if (Array.isArray(d[k])) return d[k];
      }
    }
    if (Array.isArray(v?.items)) return v.items;
    if (Array.isArray(v?.messages)) return v.messages;
    if (Array.isArray(v?.chats)) return v.chats;
    return [v];
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("wacli error")) throw e;
    // Fall back to NDJSON.
    return trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }
}

// wacli JSON field names are not documented; normalize the likely variants.
function pick<T = string>(o: any, keys: string[], fallback: T | null = null): T | null {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k] as T;
  }
  return fallback;
}

export function normalizeChat(o: any): WaChat {
  const jid = pick(o, ["jid", "id", "chat_jid", "chatJid"]) || "";
  return {
    jid,
    name: pick(o, ["name", "subject", "title", "display_name"]) || jid,
    isGroup: o.kind === "group" || jid.endsWith("@g.us") || Boolean(pick(o, ["is_group", "isGroup"], null)),
  };
}

export function normalizeMessage(o: any, chatName: string): WaMessage {
  // wacli uses PascalCase keys (Text, Timestamp, SenderName, ...); keep lowercase fallbacks too.
  const rawTs = pick<any>(o, ["Timestamp", "timestamp", "time", "ts", "date", "sent_at"]);
  let iso: string;
  if (typeof rawTs === "number") {
    iso = new Date(rawTs < 1e12 ? rawTs * 1000 : rawTs).toISOString();
  } else if (rawTs) {
    iso = new Date(rawTs).toISOString();
  } else {
    iso = new Date(0).toISOString();
  }
  // Prefer real message text; fall back to media caption. DisplayText is a placeholder like "(message)".
  const text = pick(o, ["Text", "text", "body", "content", "message"]) ||
    pick(o, ["MediaCaption", "caption"]) || "";
  return {
    id: String(pick(o, ["MsgID", "id", "msg_id", "message_id", "key_id"]) || ""),
    chatJid: pick(o, ["ChatJID", "chat", "chat_jid", "chatJid", "chatId"]) || "",
    chatName: pick(o, ["ChatName"]) || chatName,
    sender: pick(o, ["SenderName", "SenderJID", "sender", "sender_jid", "from", "author", "pushname"]) || "unknown",
    timestamp: iso,
    text,
  };
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
  const after = afterIso.slice(0, 10); // wacli accepts YYYY-MM-DD or RFC3339
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
