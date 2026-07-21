import { z } from "zod";

// Structured-output schema for the scam/spam classifier. Strict mode: every field
// required, .nullable() (not .optional()) for unknowns. Mirrors extract/schema.ts.
export const FlagVerdictSchema = z.object({
  category: z
    .enum(["scam", "spam", "safe"])
    .describe(
      "scam = fraud/deceptive selling (account resale, fake deals, phishing, 'proof available', 'serious buyers only'); " +
        "spam = unsolicited promotion/advertising that isn't fraud; safe = normal community message.",
    ),
  confidence: z
    .number()
    .describe("0..1: how confident this message is the stated category (not safe)."),
  reason: z
    .string()
    .describe("One short sentence citing the specific signal(s) that drove the verdict."),
});

export const ModerationSchema = z.object({
  verdicts: z
    .array(
      z.object({
        index: z.number().describe("The [n] index of the message in the batch."),
        category: FlagVerdictSchema.shape.category,
        confidence: FlagVerdictSchema.shape.confidence,
        reason: FlagVerdictSchema.shape.reason,
      }),
    )
    .describe("One verdict per message reviewed, keyed by its [n] index."),
});

export type Moderation = z.infer<typeof ModerationSchema>;
