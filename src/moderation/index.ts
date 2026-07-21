import { config } from "../config.js";
import type { FlagCategory, MessageFlag, WaMessage } from "../types.js";
import { HEURISTIC_HIGH, HEURISTIC_LOW, scoreMessage } from "./heuristics.js";
import { classifyMessages, type ClassifyInput } from "./classify.js";

// Signals that indicate deception (scam) rather than mere advertising (spam).
const SCAMMY = /seller|buyer|proof|deal|payment|resale|premium|navigator|plan|method|choose me/i;

function toFlag(
  msg: WaMessage,
  category: FlagCategory,
  confidence: number,
  reason: string,
  signals: string[],
): MessageFlag {
  return {
    category,
    confidence,
    reason,
    signals: signals.join(", "),
    sender: msg.sender,
    msgTimestamp: msg.timestamp,
    sourceChat: msg.chatName,
    sourceMsgId: msg.id,
    sourceText: msg.text,
  };
}

/**
 * Two-layer moderation. Layer 1 (heuristics) scores every message for free and
 * routes it: skip / obvious-flag / ask-the-LLM. Layer 2 (LLM) only judges the
 * borderline band. Returns flags at/above the moderation confidence threshold.
 */
export async function moderateMessages(messages: WaMessage[]): Promise<MessageFlag[]> {
  if (!config.moderationEnabled) return [];

  const flags: MessageFlag[] = [];
  const borderline: ClassifyInput[] = [];

  for (const msg of messages) {
    const { score, signals } = scoreMessage(msg.text);
    if (score < HEURISTIC_LOW) continue; // clearly fine, no cost
    if (score >= HEURISTIC_HIGH) {
      // Obvious enough to flag without an LLM call.
      const category: FlagCategory = signals.some((s) => SCAMMY.test(s)) ? "scam" : "spam";
      flags.push(toFlag(msg, category, score, `auto: ${signals.join(", ")}`, signals));
    } else {
      borderline.push({ msg, signals });
    }
  }

  if (borderline.length) {
    const verdicts = await classifyMessages(borderline);
    for (const v of verdicts) {
      if (v.category === "safe") continue;
      if (v.confidence < config.moderationThreshold) continue;
      flags.push(toFlag(v.msg, v.category, v.confidence, v.reason, v.signals));
    }
  }

  return flags;
}
