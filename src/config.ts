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
  moderationEnabled?: boolean;
  moderationModel?: string;
  moderationThreshold?: number;
  moderationActionsEnabled?: boolean;
}

function loadSettings(): Settings {
  try {
    if (existsSync(SETTINGS_PATH)) return JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
  } catch {
    /* ignore malformed settings; fall back to env */
  }
  return {};
}

// Fields that the dashboard Settings page can override at runtime. Computed from
// settings.json + env so both the initial build and reloadConfig() stay in sync.
function settingsFields(s: Settings) {
  const envGroups = (process.env.WA_GROUPS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return {
    openaiModel: s.openaiModel || process.env.OPENAI_MODEL || "gpt-4o-mini",
    waGroups: s.groups && s.groups.length ? s.groups : envGroups,
    confidenceThreshold: s.confidenceThreshold ?? Number(process.env.CONFIDENCE_THRESHOLD || "0.5"),
    ingestSinceDays: s.ingestSinceDays ?? Number(process.env.INGEST_SINCE_DAYS || "14"),
    lumaCalendarUrl: s.lumaCalendarUrl || process.env.LUMA_CALENDAR_URL || "",
    lumaDryRun: s.lumaDryRun ?? process.env.LUMA_DRY_RUN === "1",
    lumaModel: s.lumaModel || process.env.LUMA_MODEL || "gpt-4o-mini",
    pollIntervalMinutes: s.pollIntervalMinutes ?? Number(process.env.POLL_INTERVAL_MIN || "10"),
    // Moderation beta: scam/spam detection over raw messages. Off by default.
    moderationEnabled: s.moderationEnabled ?? process.env.MODERATION_ENABLED === "1",
    moderationModel:
      s.moderationModel || process.env.MODERATION_MODEL || s.openaiModel || process.env.OPENAI_MODEL || "gpt-4o-mini",
    moderationThreshold: s.moderationThreshold ?? Number(process.env.MODERATION_THRESHOLD || "0.6"),
    // Gate for irreversible WhatsApp writes (delete message / remove member). Off unless
    // explicitly turned on in the dashboard; the bot itself never triggers these.
    moderationActionsEnabled:
      s.moderationActionsEnabled ?? process.env.MODERATION_ACTIONS_ENABLED === "1",
  };
}

export const config = {
  openaiApiKey: req("OPENAI_API_KEY"),
  ...settingsFields(loadSettings()),
  reviewPort: Number(process.env.REVIEW_PORT || "4600"),
  // Loopback-only receiver for `wacli sync --webhook` (live moderation in watch mode).
  webhookPort: Number(process.env.WA_WEBHOOK_PORT || "4610"),
  dataDir: "data",
  actionTokenPath: "data/.action-token",
  dbPath: "data/thc-bot.sqlite",
  settingsPath: SETTINGS_PATH,
  lumaProfileDir: ".luma-profile",
};

/**
 * Re-read settings.json and apply any dashboard changes onto the shared `config`
 * object in place, so a long-running process (e.g. `watch`) picks up Settings-page
 * edits on its next scan without a restart. `config` is mutated (not replaced) so
 * every module that imported it sees the update. Note: `pollIntervalMinutes` only
 * takes effect on the next process start, since the watch timer is set once.
 */
export function reloadConfig(): typeof config {
  Object.assign(config, settingsFields(loadSettings()));
  return config;
}
