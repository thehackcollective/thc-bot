import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { config } from "../config.js";
import type { EventLead, WaMessage } from "../types.js";
import { ExtractionSchema } from "./schema.js";

const openai = new OpenAI({ apiKey: config.openaiApiKey });

const SYSTEM = `You extract EVENT LEADS from WhatsApp community group messages.
An event lead is a specific, real-world or online event someone is announcing or sharing:
meetups, hackathons, talks, workshops, demo days, socials, conferences.

Rules:
- Extract only concrete events. Ignore general chit-chat, questions, memes, job posts, and product launches that are not events.
- Prefer messages that contain a Luma link (luma.com or lu.ma) but also extract events described in plain text.
- NEVER invent dates, locations, or URLs. If unknown, use null.
- Resolve relative dates ("next Thursday") ONLY if the message timestamp makes it unambiguous; otherwise null.
- Merge duplicate mentions of the same event into one lead.
- Set confidence honestly: 0.9+ only when title and (date or url) are clearly stated.`;

function renderBatch(messages: WaMessage[]): string {
  return messages
    .map((m) => `[${m.timestamp}] ${m.sender}: ${m.text}`)
    .join("\n");
}

// Rough char budget per request to stay well within context.
const BATCH_CHARS = 12000;

function chunk(messages: WaMessage[]): WaMessage[][] {
  const batches: WaMessage[][] = [];
  let cur: WaMessage[] = [];
  let len = 0;
  for (const m of messages) {
    const l = m.text.length + m.sender.length + 40;
    if (len + l > BATCH_CHARS && cur.length) {
      batches.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(m);
    len += l;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

export interface ExtractedLead extends EventLead {
  sourceChat: string;
  sourceMsgId: string;
  sourceText: string;
}

export async function extractEvents(messages: WaMessage[]): Promise<ExtractedLead[]> {
  const out: ExtractedLead[] = [];
  for (const batch of chunk(messages)) {
    const completion = await openai.beta.chat.completions.parse({
      model: config.openaiModel,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Group: ${batch[0]?.chatName}\nMessages:\n${renderBatch(batch)}`,
        },
      ],
      response_format: zodResponseFormat(ExtractionSchema, "extraction"),
    });
    const msg = completion.choices[0]?.message;
    if (msg?.refusal || !msg?.parsed) continue;
    for (const ev of msg.parsed.events) {
      // Attribute to the message whose URL/title best matches; fall back to batch.
      const src =
        batch.find(
          (m) =>
            (ev.lumaUrl && m.text.includes(ev.lumaUrl)) ||
            (ev.otherUrl && m.text.includes(ev.otherUrl)),
        ) || batch[0];
      out.push({
        ...ev,
        sourceChat: batch[0]?.chatName || "",
        sourceMsgId: src?.id || "",
        sourceText: src?.text || "",
      });
    }
  }
  return out;
}
