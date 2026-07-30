import type { WaChat, WaMessage } from "../types.js";

/**
 * Pure wacli output parsing/normalization, shared by the bot's ingest pipeline and
 * the dashboard's WhatsApp pages. Kept dependency-free (no config, no child_process)
 * so either side can import it. Previously the dashboard had its own strict
 * `JSON.parse` copy that threw on a stray progress line.
 */

// wacli JSON field names are not documented; normalize the likely variants.
export function pick<T = string>(o: any, keys: string[], fallback: T | null = null): T | null {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k] as T;
  }
  return fallback;
}

/**
 * Parse wacli stdout into a row array. wacli wraps results in {success, data, error}
 * but also emits bare arrays and newline-delimited JSON depending on the subcommand,
 * so handle all three. A malformed NDJSON line (e.g. a stray progress indicator) is
 * skipped rather than aborting the whole fetch.
 */
export function parseJsonOutput(stdout: string): any[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
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
    // Fall back to NDJSON, dropping any line that isn't valid JSON.
    return trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .flatMap((l) => {
        try {
          return [JSON.parse(l)];
        } catch {
          return [];
        }
      });
  }
}

export function normalizeChat(o: any): WaChat {
  const jid = pick(o, ["jid", "id", "chat_jid", "chatJid"]) || "";
  return {
    jid,
    name: pick(o, ["name", "subject", "title", "display_name"]) || jid,
    isGroup:
      o.kind === "group" || jid.endsWith("@g.us") || Boolean(pick(o, ["is_group", "isGroup"], null)),
  };
}

export function normalizeMessage(o: any, chatName: string): WaMessage {
  // wacli uses PascalCase keys (Text, Timestamp, SenderName, ...); keep lowercase fallbacks too.
  // The two wacli surfaces disagree on names: `messages list` emits ChatJID/MsgID/SenderName,
  // while the sync webhook emits Chat/ID/PushName for the same fields. Accept both.
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
  const text =
    pick(o, ["Text", "text", "body", "content", "message"]) || pick(o, ["MediaCaption", "caption"]) || "";
  return {
    id: String(pick(o, ["MsgID", "ID", "id", "msg_id", "message_id", "key_id"]) || ""),
    chatJid: pick(o, ["ChatJID", "Chat", "chat", "chat_jid", "chatJid", "chatId"]) || "",
    chatName: pick(o, ["ChatName"]) || chatName,
    sender:
      pick(o, [
        "SenderName",
        "PushName",
        "SenderJID",
        "sender",
        "sender_jid",
        "from",
        "author",
        "pushname",
      ]) || "unknown",
    // JID/phone specifically (not display name) — needed to remove a sender from a group.
    senderJid: pick(o, ["SenderJID", "sender_jid", "SenderPN", "senderPn", "participant"]) || "",
    timestamp: iso,
    text,
  };
}
