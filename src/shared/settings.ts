/**
 * Canonical shape of data/settings.json — the dashboard writes it, the bot reads it.
 *
 * Single source of truth so the two can't drift: the dashboard previously had its own
 * narrower copy that omitted `lumaModel` and `pollIntervalMinutes`, which meant those
 * fields could not be edited from the Settings page at all.
 *
 * Every field is optional on disk: a missing key falls back to the matching env var,
 * then to DEFAULT_SETTINGS. Keep this module dependency-free.
 */
export interface Settings {
  groups: string[]; // WhatsApp group JIDs (or names) to scan
  openaiModel: string;
  confidenceThreshold: number; // 0..1 minimum to queue a lead
  ingestSinceDays: number;
  lumaCalendarUrl: string;
  lumaDryRun: boolean; // stage the Luma add-event dialog but don't commit
  // Model handle passed to Stagehand when it launches the browser. The publish flow is
  // fully deterministic (no act/observe calls), so this no longer drives any inference.
  lumaModel: string;
  pollIntervalMinutes: number; // watch-mode scan cadence; read at process start
}

/** Settings file contents as they may appear on disk (any subset of Settings). */
export type PartialSettings = Partial<Settings>;

export const DEFAULT_SETTINGS: Settings = {
  groups: [],
  openaiModel: "gpt-4o-mini",
  confidenceThreshold: 0.5,
  ingestSinceDays: 30,
  lumaCalendarUrl: "",
  lumaDryRun: false,
  lumaModel: "gpt-4o-mini",
  pollIntervalMinutes: 10,
};
