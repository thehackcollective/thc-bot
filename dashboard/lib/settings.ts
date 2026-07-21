import "server-only";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const SETTINGS_PATH =
  process.env.THC_SETTINGS_PATH || join(process.cwd(), "..", "data", "settings.json");

export interface Settings {
  groups: string[]; // WhatsApp group JIDs to scan
  openaiModel: string;
  confidenceThreshold: number; // 0..1 minimum to queue a lead
  ingestSinceDays: number;
  lumaCalendarUrl: string;
  lumaDryRun: boolean; // fill Luma form but don't submit
  moderationEnabled: boolean; // scam/spam detection beta
  moderationThreshold: number; // 0..1 min confidence to keep an LLM flag
}

export const DEFAULT_SETTINGS: Settings = {
  groups: [],
  openaiModel: "gpt-4o-mini",
  confidenceThreshold: 0.5,
  ingestSinceDays: 30,
  lumaCalendarUrl: "",
  lumaDryRun: false,
  moderationEnabled: false,
  moderationThreshold: 0.6,
};

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
