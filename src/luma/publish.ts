import { mkdirSync } from "node:fs";
import { Stagehand } from "@browserbasehq/stagehand";
import { config } from "../config.js";
import type { QueuedLead } from "../types.js";

// DRY_RUN fills the form but does NOT click the final "Create Event" button —
// use it to test the flow safely (esp. on the live THC calendar).
// Controlled by dashboard settings (config.lumaDryRun) or LUMA_DRY_RUN=1.
const DRY_RUN = config.lumaDryRun;

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
 * Set a React-controlled input's value reliably: assign via the native setter and
 * dispatch input/change so React's onChange fires (a plain .value = x is ignored).
 */
async function fillReactInput(page: any, selector: string, value: string): Promise<void> {
  // Body runs in the browser; use globalThis casts so the Node-targeted tsc has no DOM lib complaints.
  await page.evaluate(
    ({ sel, val }: { sel: string; val: string }) => {
      const g = globalThis as any;
      const xp = sel.replace(/^xpath=/, "");
      const el = g.document.evaluate(xp, g.document, null, 9, null).singleNodeValue;
      if (!el) throw new Error("input not found: " + sel);
      const setter = Object.getOwnPropertyDescriptor(g.HTMLInputElement.prototype, "value")?.set;
      setter?.call(el, val);
      el.dispatchEvent(new g.Event("input", { bubbles: true }));
      el.dispatchEvent(new g.Event("change", { bubbles: true }));
    },
    { sel: selector, val: value },
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
    await sh.act("Click the Add Event button in the Events section");
    await sh.act("Click the option to add an existing Luma event");

    // Fill the URL field via a native-value setter: Luma's React input ignores
    // Stagehand's synthetic fill, so we set .value and dispatch input/change ourselves.
    const [urlField] = await sh.observe("the input field to paste the Luma event URL");
    if (!urlField?.selector) throw new Error("Could not find the Luma event URL input.");
    await fillReactInput(page, urlField.selector, lead.lumaUrl);

    // Stage: the small "+ Add" beside the input resolves the URL into a pending event card.
    await clickButtonByText(page, "Add");
    await new Promise((r) => setTimeout(r, 3500)); // wait for Luma to resolve the event

    if (DRY_RUN) {
      console.log(`[DRY_RUN] Staged "${lead.title}" (${lead.lumaUrl}) in the add-event dialog, not committing.`);
      return "";
    }

    // Commit: the dialog's primary "Add Event" button (last in the DOM) saves it to the calendar.
    await clickButtonByText(page, "Add Event", true);
    await page.waitForLoadState("networkidle").catch(() => {});
    await new Promise((r) => setTimeout(r, 3000)); // let the commit settle

    // Success signal: the "Add Luma Event" dialog closes only when the commit lands.
    // If it's still open, the add failed — throw so the lead stays 'approved' and can be retried.
    const dialogStillOpen = await page.evaluate(() => {
      const g = globalThis as any;
      return Array.from(g.document.querySelectorAll("h1,h2,h3,div,span")).some(
        (e: any) => e.childElementCount === 0 && e.textContent?.trim() === "Add Luma Event",
      );
    });
    if (dialogStillOpen) {
      throw new Error("Add-to-calendar did not complete (dialog still open). Event was not added.");
    }

    return lead.lumaUrl;
  } finally {
    await sh.close();
  }
}
