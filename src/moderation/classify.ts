import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { config } from "../config.js";
import type { WaMessage } from "../types.js";
import type { FlagCategory } from "../types.js";
import { ModerationSchema } from "./schema.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

const SYSTEM = `You are a content moderator for a tech community's WhatsApp groups.
Classify each message as one of: scam, spam, or safe.

- scam: fraudulent or deceptive selling. Resale of accounts/subscriptions (LinkedIn Premium,
  Sales Navigator, "Claude Max", ChatGPT Plus, cracked/pro "methods"), fake deals, phishing,
  impersonation, "proof available", "serious buyers only", "trusted seller", off-platform payment lures.
- spam: unsolicited promotion or advertising that isn't outright fraud (mass ads, referral farming,
  irrelevant product pushes, link dumps).
- safe: normal community talk — questions, event sharing, job posts, banter, memes.

Rules:
- Sharing a legitimate event, job, or product someone built is NOT spam. Selling someone else's
  paid accounts/subscriptions IS scam.
- Judge intent and pattern, not single keywords. Set confidence honestly (0.9+ only when clear).
- Return exactly one verdict per message, referencing its [n] index.`;

export interface ClassifyInput {
  msg: WaMessage;
  signals: string[]; // heuristic hits, given to the model as a hint
}

export interface ClassifyOutput {
  msg: WaMessage;
  category: FlagCategory | "safe";
  confidence: number;
  reason: string;
  signals: string[];
}

function render(items: ClassifyInput[]): string {
  return items
    .map(
      (it, i) =>
        `[${i}] ${it.msg.sender}: ${it.msg.text}` +
        (it.signals.length ? `\n    (auto-flags: ${it.signals.join(", ")})` : ""),
    )
    .join("\n");
}

const BATCH_CHARS = 12000;

function chunk(items: ClassifyInput[]): ClassifyInput[][] {
  const batches: ClassifyInput[][] = [];
  let cur: ClassifyInput[] = [];
  let len = 0;
  for (const it of items) {
    const l = it.msg.text.length + 60;
    if (len + l > BATCH_CHARS && cur.length) {
      batches.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(it);
    len += l;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

/** LLM classification for borderline messages. Returns a verdict per input. */
export async function classifyMessages(items: ClassifyInput[]): Promise<ClassifyOutput[]> {
  const out: ClassifyOutput[] = [];
  for (const batch of chunk(items)) {
    const completion = await openai.beta.chat.completions.parse({
      model: config.moderationModel,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Messages:\n${render(batch)}` },
      ],
      response_format: zodResponseFormat(ModerationSchema, "moderation"),
    });
    const msg = completion.choices[0]?.message;
    if (msg?.refusal || !msg?.parsed) continue;
    const byIndex = new Map(msg.parsed.verdicts.map((v) => [v.index, v]));
    batch.forEach((it, i) => {
      const v = byIndex.get(i);
      out.push({
        msg: it.msg,
        category: v?.category ?? "safe",
        confidence: v?.confidence ?? 0,
        reason: v?.reason ?? "",
        signals: it.signals,
      });
    });
  }
  return out;
}
