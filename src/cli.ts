import { config, reloadConfig } from "./config.js";
import { runPipeline } from "./pipeline.js";
import { startReviewServer } from "./review/server.js";
import { exportLeads } from "./export.js";
import { getLead, listLeads, setStatus } from "./queue/store.js";
import { login, publishLead } from "./luma/publish.js";
import type { LeadStatus } from "./types.js";

const [cmd, ...rest] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case "run":
    case "ingest":
    case "extract": {
      // Ingest + extract are one pipeline; all three aliases run it.
      const { scanned, inserted, flagged } = await runPipeline();
      console.log(
        `Done. Scanned ${scanned} msg(s), ${inserted} new lead(s) queued${flagged ? `, ${flagged} flagged` : ""}.`,
      );
      break;
    }
    case "review":
      startReviewServer();
      await new Promise<never>(() => {}); // keep process alive
      break;
    case "export": {
      const status = (rest[0] as LeadStatus) || "pending";
      exportLeads(status);
      break;
    }
    case "publish": {
      // Add approved lead(s) to the Luma calendar — one by id, or all approved.
      const id = rest[0] ? Number(rest[0]) : null;
      const targets = id ? [getLead(id)!].filter(Boolean) : listLeads("approved");
      for (const l of targets) {
        if (!l.lumaUrl) {
          console.log(`Skipping #${l.id} "${l.title}" — no Luma URL to add.`);
          continue;
        }
        console.log(`Adding #${l.id} to calendar: ${l.title}`);
        const url = await publishLead(l);
        // Dry-run adds nothing, so leave status untouched; only mark published on a real add.
        if (url) {
          setStatus(l.id, "published", url);
          console.log(`  → added: ${url}`);
        } else {
          console.log("  → (dry run, not added)");
        }
      }
      break;
    }
    case "watch": {
      // Continuously ingest WhatsApp + scan for events on an interval.
      const { spawn } = await import("node:child_process");
      const intervalMs = Math.max(1, config.pollIntervalMinutes) * 60_000;
      console.log(
        `Watch mode: wacli sync --follow + scan every ${config.pollIntervalMinutes} min. Ctrl+C to stop.`,
      );
      // Keep wacli pulling fresh messages into its local DB while we run.
      const sync = spawn("wacli", ["sync", "--follow"], { stdio: "ignore" });
      sync.on("error", (e) => console.error("wacli sync failed to start:", e.message));

      const tick = async () => {
        try {
          // Pick up Settings-page changes (groups, threshold, etc.) written to
          // settings.json since the process started, before each scan.
          reloadConfig();
          const { scanned, inserted, flagged } = await runPipeline();
          console.log(
            `[${new Date().toISOString()}] scanned ${scanned} msg(s), ${inserted} new lead(s)${flagged ? `, ${flagged} flagged` : ""}.`,
          );
        } catch (e) {
          console.error("scan error:", e);
        }
      };
      await tick();
      const timer = setInterval(tick, intervalMs);
      const stop = () => {
        clearInterval(timer);
        sync.kill();
        process.exit(0);
      };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      await new Promise<never>(() => {}); // run until interrupted
      break;
    }
    case "login":
      await login();
      break;
    default:
      console.log(`thc-bot commands:
  run        ingest WhatsApp + extract event leads into the review queue
  watch      keep syncing WhatsApp and scanning on an interval (auto mode)
  review     start the review dashboard (approve/reject/publish)
  publish    [id]  publish approved lead(s) to Luma via browser
  export     [status]  dump leads to CSV + Markdown (manual-upload fallback)
  login      one-time interactive Luma sign-in (persists session)`);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
