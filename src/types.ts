// Shared domain types.

export interface WaMessage {
  id: string;
  chatJid: string;
  chatName: string;
  sender: string;
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
