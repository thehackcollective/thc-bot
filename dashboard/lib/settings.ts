import "server-only";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_SETTINGS, type Settings } from "@bot/shared/settings";

// Shape + defaults come from the bot's shared module (single source of truth), so the
// dashboard can edit every field the bot reads — the previous local copy omitted
// lumaModel and pollIntervalMinutes, making them un-editable from the Settings page.
export { DEFAULT_SETTINGS };
export type { Settings };

const SETTINGS_PATH =
  process.env.THC_SETTINGS_PATH || join(process.cwd(), "..", "data", "settings.json");

export function readSettings(): Settings {
  try {
    if (existsSync(SETTINGS_PATH)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) };
    }
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const next = { ...readSettings(), ...patch };
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2));
  return next;
}
