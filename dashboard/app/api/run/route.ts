import { spawn } from "node:child_process";
import { join } from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BOT_ROOT = join(process.cwd(), "..");

// Trigger one ingest+extract pass and stream its stdout/stderr back live,
// so the dashboard can render a running console instead of polling.
export async function POST() {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = (s: string) => {
        if (!closed) controller.enqueue(enc.encode(s));
      };
      const end = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      const child = spawn("npm", ["run", "--silent", "run"], {
        cwd: BOT_ROOT,
        env: process.env,
      });
      child.stdout.on("data", (d) => send(d.toString()));
      child.stderr.on("data", (d) => send(d.toString()));
      child.on("error", (e) => {
        send(`\n[error] ${e.message}\n`);
        end();
      });
      child.on("close", (code) => {
        send(`\n[done] exit ${code ?? 0}\n`);
        end();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
