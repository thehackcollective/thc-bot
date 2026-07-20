import { getLead, setStatus } from "@/lib/db";
import { spawnPublish } from "@/lib/publish";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Noisy library lines we don't want in the user-facing console.
const NOISE = /AI SDK Warning|allowSystemInMessages|performing understudy|^\[stagehand\] response$/;

// Approve + add one lead to the Luma calendar, streaming the bot's output back live.
export async function POST(req: Request) {
  const { id } = (await req.json()) as { id: number };
  const lead = getLead(Number(id));
  if (!lead) return new Response("lead not found", { status: 404 });
  setStatus(lead.id, "approved");

  // Guard: refuse a second concurrent publish for the same lead so we never open
  // two browsers and add the event to the calendar twice.
  const child = spawnPublish(lead.id, { stdio: "pipe" });
  if (!child) {
    return new Response("already publishing this lead\n", { status: 409 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      let buf = "";
      const emit = (s: string) => {
        if (!closed) controller.enqueue(enc.encode(s));
      };
      // Buffer to whole lines so we can filter library noise cleanly.
      const feed = (chunk: string) => {
        buf += chunk;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) if (!NOISE.test(l.trim())) emit(l + "\n");
      };
      const end = () => {
        if (closed) return;
        if (buf && !NOISE.test(buf.trim())) emit(buf + "\n");
        closed = true;
        controller.close();
      };

      child.stdout?.on("data", (d) => feed(d.toString()));
      child.stderr?.on("data", (d) => feed(d.toString()));
      child.on("error", (e) => {
        emit(`\n[error] ${e.message}\n`);
        end();
      });
      child.on("close", (code) => {
        emit(`\n[done] exit ${code ?? 0}\n`);
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
