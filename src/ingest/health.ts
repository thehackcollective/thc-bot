import { createServer, type Server } from "node:http";
import { config } from "../config.js";

/**
 * Loopback-only liveness endpoint for the dashboard's bot-status badge.
 *
 * GET /health returns nothing sensitive and is bound to 127.0.0.1, so it needs no
 * auth — it is the authoritative "is the bot running?" answer.
 */

const STARTED_AT = new Date().toISOString();

export function startHealthServer(): { server: Server; url: string } {
  const server = createServer((req, res) => {
    if (req.method === "GET" && (req.url || "").startsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, pid: process.pid, since: STARTED_AT }));
      return;
    }
    res.writeHead(404).end();
  });

  // A silent bind failure would leave the dashboard permanently reporting the bot
  // as offline. Fail loudly instead.
  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") {
      console.error(
        `Port ${config.webhookPort} is already in use — another bot instance is probably running. Stop it first (WA_WEBHOOK_PORT overrides the port).`,
      );
    } else {
      console.error("health server error:", e.message);
    }
    process.exit(1);
  });
  server.listen(config.webhookPort, "127.0.0.1");
  return { server, url: `http://127.0.0.1:${config.webhookPort}/health` };
}
