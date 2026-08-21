import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const BOT_ROOT = join(process.cwd(), "..");

// In-process guard so the same lead can't be published twice at once (a rapid
// double-click, or two dashboard tabs). Next.js route handlers share this module
// instance, so a Set here is enough to serialize publishes per lead and stop the
// bot from spawning two Stagehand browsers that both add the event to Luma.
const inFlight = new Set<number>();

export function isPublishing(id: number): boolean {
  return inFlight.has(id);
}

/**
 * Spawn `npm run publish -- <id>` for one lead while holding an in-process lock,
 * so a concurrent request for the same lead is refused instead of opening a
 * duplicate browser. Returns the child process, or `null` if a publish for this
 * lead is already running. The lock is released when the child exits or errors.
 */
export function spawnPublish(
  id: number,
  opts: { detached?: boolean; stdio?: "ignore" | "pipe" } = {},
): ChildProcess | null {
  if (inFlight.has(id)) return null;
  inFlight.add(id);
  const child = spawn("npm", ["run", "publish", "--", String(id)], {
    cwd: BOT_ROOT,
    detached: opts.detached ?? false,
    stdio: opts.stdio ?? "pipe",
    env: process.env,
  });
  const release = () => inFlight.delete(id);
  child.once("close", release);
  child.once("error", release);
  return child;
}
