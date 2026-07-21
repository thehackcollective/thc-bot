// Shared domain types.

export interface WaMessage {
  id: string;
  chatJid: string;
  chatName: string;
  sender: string; // display name (or JID if no name)
  senderJid: string; // sender's WhatsApp JID/phone, for moderation actions
  timestamp: string; // ISO 8601
  text: string;
}

export interface WaChat {
  jid: string;
  name: string;
  isGroup: boolean;
}

// One extracted event lead (LLM output shape mirrors this; see extract/schema.ts).
export interface EventLead {
  title: string;
  description: string;
  startDate: string | null; // ISO date/time if known, else null
  endDate: string | null;
  timezone: string | null;
  location: string | null; // venue or "Online"
  lumaUrl: string | null; // luma.com/... if present
  otherUrl: string | null; // fallback registration/info link
  host: string | null;
  confidence: number; // 0..1 model confidence this is a real event lead
}

// --- Moderation (scam/spam detection beta) ---

export type FlagCategory = "scam" | "spam";

export interface MessageFlag {
  category: FlagCategory;
  confidence: number; // 0..1
  reason: string; // why it was flagged (heuristic label or model reason)
  signals: string; // comma-joined heuristic signal labels
  sender: string;
  senderJid: string; // for the optional "remove sender" moderation action
  msgTimestamp: string; // ISO of the flagged message
  sourceChat: string; // chat display name
  chatJid: string; // chat JID (for delete/remove actions)
  sourceMsgId: string;
  sourceText: string;
}

export type FlagStatus = "pending" | "confirmed" | "dismissed";

export interface QueuedFlag extends MessageFlag {
  id: number;
  status: FlagStatus;
  createdAt: string;
  // Set once a WhatsApp-side action runs. Null on flags predating the feature.
  actionTaken: string | null; // 'delete' | 'remove' (comma-joined if both)
  actionAt: string | null;
  actionError: string | null;
}

export type LeadStatus = "pending" | "approved" | "rejected" | "published";

export interface QueuedLead extends EventLead {
  id: number;
  dedupeKey: string;
  sourceChat: string;
  sourceMsgId: string;
  sourceText: string;
  status: LeadStatus;
  createdAt: string;
  publishedUrl: string | null;
}
