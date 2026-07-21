import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const WACLI_BIN = process.env.WACLI_BIN || "wacli";

/**
 * Owns the long-running `wacli sync --follow` child.
 *
 * wacli guards its store with a single exclusive lock, and a following sync holds
 * that lock for its whole lifetime — so no write command (delete a message, remove
 * a participant, send) can run while it is up. This broker serializes the two: to
 * run a write we stop sync, wait for the lock to be released, run the command, then
 * bring sync back. Live moderation pauses for a couple of seconds per action; the
 * watch timer backfills anything that arrives in the gap.
 */
export class SyncBroker {
  private child: ChildProcess | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly syncArgs: string[]) {}

  start(): void {
    if (this.child) return;
    const child = spawn(WACLI_BIN, this.syncArgs, { stdio: "ignore" });
    child.on("error", (e) => console.error("wacli sync failed to start:", e.message));
    // If sync dies on its own, drop the handle so the next start() can respawn it.
    child.once("exit", () => {
      if (this.child === child) this.child = null;
    });
    this.child = child;
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
  }

  private async stopAndWait(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      child.once("exit", done);
      child.kill();
      // Don't hang forever if the child ignores SIGTERM.
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5000).unref();
    });
  }

  /**
   * Run a wacli write command with exclusive access to the store. Calls are queued
   * so two actions can never race for the lock, and sync is always restarted —
   * including when the command throws.
   */
  runWrite(args: string[]): Promise<string> {
    const task = this.queue.then(async () => {
      await this.stopAndWait();
      try {
        const env = { ...process.env };
        delete env.WACLI_READONLY; // this is the one place we intentionally write
        const { stdout } = await execFileP(
          WACLI_BIN,
          // --lock-wait covers the moment between sync exiting and the lock clearing.
          [...args, "--lock-wait", "10s", "--json"],
          { env, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
        );
        const out = stdout.trim();
        try {
          const v = JSON.parse(out);
          if (v && v.success === false) throw new Error(`wacli: ${v.error ?? "unknown error"}`);
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("wacli:")) throw e;
        }
        return out;
      } finally {
        this.start(); // always bring live moderation back
      }
    });
    // Keep the chain alive even if this task rejects.
    this.queue = task.catch(() => {});
    return task;
  }
}
