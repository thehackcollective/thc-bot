import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { config, reloadConfig } from "../config.js";
import { moderateMessages } from "../moderation/index.js";
import { upsertFlags } from "../queue/store.js";
import type { SyncBroker } from "./sync-broker.js";
import { normalizeMessage } from "./wacli.js";

/**
 * Live message receiver. `wacli sync --webhook` POSTs each incoming message as it
 * arrives, which gets moderation down from "next 10-minute tick" to ~instant.
 *
 * Event extraction deliberately stays on the timer: it batches messages into one
 * LLM call, so per-message extraction would cost far more for no real benefit.
 * The timer also re-scans from the cursor, so anything missed while this process
 * was down is still picked up.
 */

const MAX_BODY = 1024 * 1024; // a WhatsApp message payload is never near this

const STARTED_AT = new Date().toISOString();

/** Per-process secret shared with the wacli child. Rotates on every restart. */
export function newWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

/** Constant-time compare of the X-Wacli-Signature header against the body HMAC. */
function signatureValid(secret: string, body: string, header: string | undefined): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  // Strip an optional "sha256=" prefix; compare raw hex bytes.
  const got = header.replace(/^sha256=/i, "").trim();
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
}

/** wacli may post a bare message, an array, or wrap it in {message}/{data}. */
function extractMessages(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const k of ["message", "data", "messages"]) {
    const v = payload?.[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") return [v];
  }
  return payload && typeof payload === "object" ? [payload] : [];
}

async function handleMessages(raw: any[]): Promise<number> {
  const wanted = new Set(config.waGroups.map((g) => g.toLowerCase()));
  const normalized = raw
    // Own messages are NOT skipped: the timer-driven scan never skipped them either,
    // and WhatsApp only allows delete-for-everyone on messages this account sent — so
    // they're the only ones the delete action can actually act on.
    .map((r) => normalizeMessage(r, r?.ChatName || r?.chatName || ""));
  const messages = normalized
    .filter((m) => m.text.trim())
    // Only the configured groups; wacli streams every chat on the account.
    .filter((m) => !wanted.size || wanted.has(m.chatJid.toLowerCase()));

  if (!messages.length) {
    // Never fail silently here: a payload we can't read looks identical to "no new
    // messages" from the outside, which is impossible to debug after the fact.
    if (raw.length) {
      const first = raw[0] ?? {};
      console.warn(
        `webhook: ${raw.length} payload item(s), 0 usable. keys=[${Object.keys(first).join(",")}] ` +
          `parsed chatJid=${JSON.stringify(normalized[0]?.chatJid ?? null)} ` +
          `text=${JSON.stringify((normalized[0]?.text ?? "").slice(0, 40))}`,
      );
    }
    return 0;
  }

  const flags = await moderateMessages(messages);
  if (!flags.length) return 0;
  return upsertFlags(flags, new Date().toISOString());
}

/**
 * Token the dashboard presents on /action. Regenerated every run so a stale token
 * can't be replayed. Only persisted once the server is actually listening — if we
 * wrote it before binding, a second bot instance losing the port race would leave
 * its dead token on disk and lock the live instance out.
 */
export function newActionToken(): string {
  return randomBytes(32).toString("hex");
}

function persistActionToken(token: string): void {
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(config.actionTokenPath, token, { mode: 0o600 });
}

export function clearActionToken(): void {
  try {
    rmSync(config.actionTokenPath, { force: true });
  } catch {
    /* best effort on shutdown */
  }
}

interface ActionRequest {
  op?: string;
  chat?: string;
  msgId?: string;
  groupJid?: string;
  user?: string;
}

/** Map a dashboard action onto a wacli write command. Throws on anything unknown. */
function buildWriteArgs(body: ActionRequest): string[] {
  // Re-read settings so turning the gate off in the dashboard takes effect
  // immediately, without restarting the bot.
  reloadConfig();
  if (!config.moderationActionsEnabled) {
    throw new Error("Moderation actions are disabled. Enable them in Settings first.");
  }
  if (body.op === "delete") {
    if (!body.chat || !body.msgId) throw new Error("delete requires chat and msgId");
    return ["messages", "delete", "--chat", body.chat, "--id", body.msgId];
  }
  if (body.op === "remove") {
    if (!body.groupJid || !body.user) throw new Error("remove requires groupJid and user");
    if (!body.groupJid.endsWith("@g.us")) throw new Error(`Not a group JID: ${body.groupJid}`);
    return ["groups", "participants", "remove", "--jid", body.groupJid, "--user", body.user];
  }
  throw new Error(`unknown op: ${body.op}`);
}

function tokenValid(expected: string, got: string | undefined): boolean {
  if (!got || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/**
 * Start the receiver on 127.0.0.1 only. Serves two routes:
 *   POST /wa      — live messages from `wacli sync --webhook` (HMAC-signed)
 *   POST /action  — moderation actions from the dashboard (bearer token), run
 *                   through the broker so they don't fight sync for the store lock
 * Returns the server plus the URL to hand to wacli.
 */
export function startWebhookServer(
  secret: string,
  opts: { broker?: SyncBroker; actionToken?: string } = {},
): { server: Server; url: string } {
  const server = createServer((req, res) => {
    // Liveness probe for the dashboard. Loopback-only and returns nothing sensitive,
    // so it needs no auth — it's the authoritative "is the bot running?" answer.
    if (req.method === "GET" && (req.url || "").startsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, pid: process.pid, since: STARTED_AT }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    const isAction = (req.url || "").startsWith("/action");
    let body = "";
    let tooBig = false;
    req.on("data", (c) => {
      body += c;
      if (body.length > MAX_BODY && !tooBig) {
        tooBig = true;
        res.writeHead(413).end();
        req.destroy();
      }
    });
    req.on("end", () => {
      if (tooBig) return;

      if (isAction) {
        const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        if (!opts.actionToken || !opts.broker || !tokenValid(opts.actionToken, auth)) {
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
          return;
        }
        let args: string[];
        try {
          args = buildWriteArgs(JSON.parse(body));
        } catch (e: any) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
          return;
        }
        // Held open until the write finishes: the dashboard needs the real outcome.
        opts.broker
          .runWrite(args)
          .then(() => {
            console.log(`  action: ${args.slice(0, 2).join(" ")} ok`);
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          })
          .catch((e: any) => {
            const msg = String(e?.message || e);
            console.error(`  action failed: ${msg}`);
            res.writeHead(502, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: msg }));
          });
        return;
      }

      if (!signatureValid(secret, body, req.headers["x-wacli-signature"] as string | undefined)) {
        console.warn("webhook: rejected message with bad/missing signature");
        res.writeHead(401).end();
        return;
      }
      // Ack immediately; moderation (which may call the LLM) runs after.
      res.writeHead(204).end();
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        console.warn("webhook: unparseable payload");
        return;
      }
      const items = extractMessages(payload);
      console.log(`webhook: POST /wa (${items.length} item(s))`);
      handleMessages(items)
        .then((n) => {
          if (n) console.log(`  ⚠ ${n} message(s) flagged (scam/spam) — live`);
        })
        .catch((e) => console.error("webhook moderation failed:", e));
    });
  });

  // A silent bind failure would leave a bot with no live moderation and, worse, a
  // stale token on disk. Fail loudly instead.
  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") {
      console.error(
        `Port ${config.webhookPort} is already in use — another bot instance is probably running. Stop it first (WA_WEBHOOK_PORT overrides the port).`,
      );
    } else {
      console.error("webhook server error:", e.message);
    }
    process.exit(1);
  });
  server.listen(config.webhookPort, "127.0.0.1", () => {
    if (opts.actionToken) persistActionToken(opts.actionToken);
  });
  return { server, url: `http://127.0.0.1:${config.webhookPort}/wa` };
}
