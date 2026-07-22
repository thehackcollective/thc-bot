import { z } from "zod";

// Strict structured-output schema. Every field required; unknowns disallowed.
// Optional info uses .nullable() (not .optional()) per OpenAI strict mode.
export const EventLeadSchema = z.object({
  title: z.string().describe("Event name. Concise."),
  description: z
    .string()
    .describe("1-3 sentence summary of what the event is, drawn only from the message."),
  startDate: z
    .string()
    .nullable()
    .describe("ISO 8601 start datetime if stated/derivable, else null. Do not invent."),
  endDate: z.string().nullable().describe("ISO 8601 end datetime if stated, else null."),
  timezone: z.string().nullable().describe("IANA tz or offset if stated, else null."),
  location: z.string().nullable().describe('Venue/address, or "Online", else null.'),
  lumaUrl: z.string().nullable().describe("A luma.com / lu.ma event URL if present, else null."),
  otherUrl: z
    .string()
    .nullable()
    .describe("Other registration/info URL if no Luma link, else null."),
  host: z.string().nullable().describe("Organizer/host name if stated, else null."),
  confidence: z
    .number()
    .describe("0..1: how confident this is a real, specific event lead (not chatter)."),
});

export const ExtractionSchema = z.object({
  events: z
    .array(EventLeadSchema)
    .describe("All distinct event leads found. Empty array if none."),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
