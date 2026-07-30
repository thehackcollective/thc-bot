import { mkdirSync } from "node:fs";
import { Stagehand } from "@browserbasehq/stagehand";
import { config } from "../config.js";
import type { QueuedLead } from "../types.js";

function makeStagehand(headless: boolean): Stagehand {
  mkdirSync(config.lumaProfileDir, { recursive: true }); // chrome-launcher needs the dir to exist for chrome-out.log
  return new Stagehand({
    env: "LOCAL",
    // Default Pino logger crashes Node's util.inspect on some log objects; use a
    // string-only logger and disable Pino so a publish never dies on a log line.
    verbose: 1,
    disablePino: true,
    logger: (l) => {
      const msg = typeof l.message === "string" ? l.message : JSON.stringify(l.message);
      if (l.level === 0) console.error(`[stagehand] ${msg}`);
      else console.log(`[stagehand] ${msg}`);
    },
    model: { modelName: `openai/${config.lumaModel}`, apiKey: config.openaiApiKey },
    localBrowserLaunchOptions: {
      headless,
      viewport: { width: 1288, height: 900 },
      userDataDir: config.lumaProfileDir, // persists Luma login between runs
      preserveUserDataDir: true,
    },
  });
}

/** One-time interactive login. Opens a real browser; user signs into Luma; session persists. */
export async function login(): Promise<void> {
  const sh = makeStagehand(false);
  await sh.init();
  const page = sh.context.pages()[0];
  await page.goto("https://luma.com/signin");
  console.log(
    "\nSign in to Luma in the opened browser window.\n" +
      "When you can see your dashboard, press ENTER here to save the session.",
  );
  await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
  await sh.close();
  console.log("Session saved to", config.lumaProfileDir);
}

/**
 * Click a visible <button> by its exact text. `last: true` picks the last match —
 * used for "Add Event", which appears both as the section trigger and (later in the
 * DOM) as the dialog's primary commit button.
 */
async function clickButtonByText(page: any, text: string, last = false): Promise<void> {
  await page.evaluate(
    ({ t, useLast }: { t: string; useLast: boolean }) => {
      const g = globalThis as any;
      const btns = Array.from(g.document.querySelectorAll("button")).filter(
        (b: any) => b.offsetParent !== null && (b.innerText || "").trim() === t,
      ) as any[];
      const el = useLast ? btns[btns.length - 1] : btns[0];
      if (!el) throw new Error(`button not found: "${t}"`);
      el.click();
    },
    { t: text, useLast: last },
  );
}

/**
 * Click the first visible, clickable element whose trimmed text matches one of
 * `texts` (case-insensitive, exact first then substring). Broader than
 * clickButtonByText: Luma renders some choices as menu items / divs rather than
 * <button>, so this covers the "add an existing Luma event" option deterministically
 * instead of asking an LLM to find it.
 */
async function clickChoiceByText(page: any, texts: string[]): Promise<void> {
  const clicked = await page.evaluate((wanted: string[]) => {
    const g = globalThis as any;
    const want = wanted.map((w) => w.toLowerCase());
    const nodes = Array.from(
      g.document.querySelectorAll(
        'button, a, [role="menuitem"], [role="option"], [role="button"], li, label, div, span',
      ),
    ) as any[];
    const visible = nodes.filter((el) => el.offsetParent !== null);
    // Prefer the deepest match so we click the label itself, not a wrapping container.
    const leaves = visible.filter((el) => el.childElementCount === 0);
    const pick = (pool: any[], match: (t: string) => boolean) =>
      pool.find((el) => match((el.innerText || el.textContent || "").trim().toLowerCase()));

    const el =
      pick(leaves, (t) => want.includes(t)) ||
      pick(visible, (t) => want.includes(t)) ||
      pick(leaves, (t) => want.some((w) => t.includes(w))) ||
      pick(visible, (t) => want.some((w) => t.includes(w)));
    if (!el) return false;
    // Clicking a leaf <span> inside a button still triggers the button via bubbling.
    (el.closest('button, a, [role="menuitem"], [role="option"], [role="button"]') || el).click();
    return true;
  }, texts);
  if (!clicked) throw new Error(`no clickable element matching: ${texts.join(" | ")}`);
}

/**
 * Find the Luma event-URL input and set it in one pass via the native value setter
 * (Luma's React input ignores a plain .value assignment). Replaces an LLM `observe`
 * call: the field is identified by placeholder/name/type, preferring an input inside
 * the open dialog.
 */
async function fillLumaUrlInput(page: any, value: string): Promise<void> {
  const ok = await page.evaluate((val: string) => {
    const g = globalThis as any;
    const setValue = (el: any) => {
      const proto =
        el.tagName === "TEXTAREA" ? g.HTMLTextAreaElement.prototype : g.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, val);
      el.dispatchEvent(new g.Event("input", { bubbles: true }));
      el.dispatchEvent(new g.Event("change", { bubbles: true }));
    };
    // Scope to the dialog when one is open so we don't grab a page-level search box.
    const scope =
      g.document.querySelector('[role="dialog"], [aria-modal="true"]') || g.document;
    const inputs = (
      Array.from(scope.querySelectorAll("input, textarea")) as any[]
    ).filter((el) => el.offsetParent !== null && !el.disabled && el.type !== "hidden");
    if (!inputs.length) return false;

    const hint = (el: any) =>
      `${el.placeholder || ""} ${el.name || ""} ${el.getAttribute("aria-label") || ""} ${el.id || ""}`.toLowerCase();
    const el =
      inputs.find((i) => /luma|event|url|link|paste/.test(hint(i))) ||
      inputs.find((i) => i.type === "url") ||
      inputs.find((i) => i.type === "text" || i.type === "" || !i.type) ||
      inputs[0];
    if (!el) return false;
    el.focus?.();
    setValue(el);
    return true;
  }, value);
  if (!ok) throw new Error("Could not find the Luma event URL input.");
}

/**
 * Poll a browser-side predicate until it returns true or the timeout elapses.
 * Returns whether the predicate became true. Used instead of fixed sleeps so a
 * slow Luma round-trip doesn't trip a premature failure. The predicate must be
 * self-contained (it is serialized and evaluated in the page).
 */
async function waitFor(
  page: any,
  predicate: () => boolean,
  { timeoutMs = 15000, intervalMs = 300 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await page.evaluate(predicate)) return true;
    } catch {
      /* transient (navigation / detached frame) — retry until the deadline */
    }
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** True while Luma's "Add Luma Event" dialog is still on screen (i.e. commit not done). */
function addDialogOpen(): boolean {
  const g = globalThis as any;
  return Array.from(g.document.querySelectorAll("h1,h2,h3,div,span")).some(
    (e: any) => e.childElementCount === 0 && e.textContent?.trim() === "Add Luma Event",
  );
}

/**
 * Add an EXISTING Luma event (lead.lumaUrl) to the THC calendar via the manage-page
 * "Add Event → add an existing Luma event → paste URL" flow. THC curates events it
 * doesn't host, so we import them onto the calendar rather than creating new ones.
 * Returns the added event URL, or "" if DRY_RUN. Needs an authenticated session
 * (run `npm run login` once) and config.lumaCalendarUrl set to the calendar manage URL.
 */
export async function publishLead(lead: QueuedLead): Promise<string> {
  // Read dry-run per call, not at module load: a Settings-page toggle must take effect
  // on the next publish without restarting the process.
  const dryRun = config.lumaDryRun;
  if (!config.lumaCalendarUrl) {
    throw new Error("No LUMA_CALENDAR_URL set. Point it at your calendar's manage URL.");
  }
  if (!lead.lumaUrl) {
    // Only existing Luma events can be added to a calendar; plain-text leads have no event to import.
    throw new Error(`Lead #${lead.id} has no Luma URL — nothing to add to the calendar. Skipping.`);
  }

  const sh = makeStagehand(true); // headless — adding needs no visible window
  await sh.init();
  try {
    const page = sh.context.pages()[0];
    await page.goto(config.lumaCalendarUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {}); // let any auth redirect resolve

    // Guard: Luma bounces logged-out users to /signin. Deterministic check — no LLM guess.
    if (/\/(signin|login)/i.test(page.url())) {
      throw new Error("Not signed in to Luma. Run `npm run login` first.");
    }

    // Manage-page flow: Add Event → add an existing Luma event → paste the URL → Add.
    // All steps are deterministic DOM queries: no LLM act/observe, so a publish costs
    // no OpenAI tokens and fails loudly (with the text it looked for) if Luma renames
    // something, instead of silently guessing at a different control.
    await clickButtonByText(page, "Add Event");
    await clickChoiceByText(page, [
      "add an existing Luma event",
      "add existing Luma event",
      "existing Luma event",
    ]);

    // Fill the URL field via a native-value setter: Luma's React input ignores a plain
    // .value assignment, so we set it and dispatch input/change ourselves.
    await fillLumaUrlInput(page, lead.lumaUrl);

    // Stage: the small "+ Add" beside the input resolves the URL into a pending event card.
    // Wait for that XHR to settle (network idle) rather than a fixed sleep, so a slow
    // resolve doesn't leave the event unstaged before we commit.
    await clickButtonByText(page, "Add");
    await page.waitForLoadState("networkidle").catch(() => {}); // wait for Luma to resolve the event

    if (dryRun) {
      console.log(`[DRY_RUN] Staged "${lead.title}" (${lead.lumaUrl}) in the add-event dialog, not committing.`);
      return "";
    }

    // Commit: the dialog's primary "Add Event" button (last in the DOM) saves it to the calendar.
    await clickButtonByText(page, "Add Event", true);
    await page.waitForLoadState("networkidle").catch(() => {});

    // Success signal: the "Add Luma Event" dialog closes only when the commit lands.
    // Poll for it (up to a generous timeout) instead of a fixed sleep, so a slow
    // round-trip isn't misread as a failure. If it never closes the add failed —
    // throw so the lead stays 'approved' and can be retried.
    const committed = await waitFor(page, () => !addDialogOpen(), { timeoutMs: 15000 });
    if (!committed) {
      throw new Error("Add-to-calendar did not complete (dialog still open). Event was not added.");
    }

    return lead.lumaUrl;
  } finally {
    await sh.close();
  }
}
