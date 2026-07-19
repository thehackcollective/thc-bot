import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}. Copy .env.example to .env and fill it.`);
  return v;
}

const SETTINGS_PATH = "data/settings.json";

// Settings written by the dashboard override .env defaults, so UI changes take effect
// without editing files. Missing/invalid file => pure env behaviour.
interface Settings {
  groups?: string[];
  openaiModel?: string;
  confidenceThreshold?: number;
  ingestSinceDays?: number;
  lumaCalendarUrl?: string;
  lumaDryRun?: boolean;
  lumaModel?: string;
  pollIntervalMinutes?: number;
}

function loadSettings(): Settings {
  try {
    if (existsSync(SETTINGS_PATH)) return JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
  } catch {
    /* ignore malformed settings; fall back to env */
  }
  return {};
}

const s = loadSettings();

const envGroups = (process.env.WA_GROUPS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

export const config = {
  openaiApiKey: req("OPENAI_API_KEY"),
  openaiModel: s.openaiModel || process.env.OPENAI_MODEL || "gpt-4o-mini",
  waGroups: s.groups && s.groups.length ? s.groups : envGroups,
  confidenceThreshold:
    s.confidenceThreshold ?? Number(process.env.CONFIDENCE_THRESHOLD || "0.5"),
  ingestSinceDays: s.ingestSinceDays ?? Number(process.env.INGEST_SINCE_DAYS || "14"),
  lumaCalendarUrl: s.lumaCalendarUrl || process.env.LUMA_CALENDAR_URL || "",
  lumaDryRun: s.lumaDryRun ?? process.env.LUMA_DRY_RUN === "1",
  lumaModel: s.lumaModel || process.env.LUMA_MODEL || "gpt-4o-mini",
  pollIntervalMinutes: s.pollIntervalMinutes ?? Number(process.env.POLL_INTERVAL_MIN || "10"),
  reviewPort: Number(process.env.REVIEW_PORT || "4600"),
  dataDir: "data",
  dbPath: "data/thc-bot.sqlite",
  settingsPath: SETTINGS_PATH,
  lumaProfileDir: ".luma-profile",
};
