import type { WaMessage } from "../types.js";
import type { ExtractedLead } from "./events.js";

// Matches luma.com/<slug> and lu.ma/<slug> (slug = event id). Global for multiple per message.
const LUMA_URL_RE = /https?:\/\/(?:www\.)?(?:luma\.com|lu\.ma)\/([A-Za-z0-9\-_]+)/gi;

export function findLumaUrls(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(LUMA_URL_RE)) {
    // Skip non-event paths (e.g. luma.com/discover, /signin, /create).
    const slug = m[1].toLowerCase();
    if (["discover", "signin", "create", "home", "settings", "u"].includes(slug)) continue;
    out.add(m[0]);
  }
  return [...out];
}

export function hasLumaUrl(text: string): boolean {
  return findLumaUrls(text).length > 0;
}

interface LumaFields {
  title: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  host: string | null;
  timezone: string | null;
}

/** Luma descriptions are full event pages; keep a tidy 1-2 sentence summary for the card. */
function summarize(text: string | null, max = 220): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  // Prefer a sentence end, else a word boundary, within the budget.
  const dot = cut.lastIndexOf(". ");
  const end = dot > max * 0.5 ? dot + 1 : cut.lastIndexOf(" ");
  return flat.slice(0, end > 0 ? end : max).trim() + "…";
}

/** Pull JSON-LD Event objects out of raw HTML (Luma emits schema.org Event blocks). */
function parseJsonLd(html: string): LumaFields | null {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const b of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(b[1].trim());
    } catch {
      continue;
    }
    // JSON-LD may be a single object, an array, or wrapped in @graph.
    const candidates: any[] = Array.isArray(data)
      ? data
      : (data as any)?.["@graph"]
        ? (data as any)["@graph"]
        : [data];
    const ev = candidates.find((c) => {
      const t = c?.["@type"];
      return typeof t === "string" && /event/i.test(t);
    });
    if (!ev) continue;

    const loc = ev.location;
    let location: string | null = null;
    if (typeof loc === "string") location = loc;
    else if (loc?.name || loc?.address) {
      const addr = typeof loc.address === "string" ? loc.address : loc.address?.streetAddress;
      location = [loc.name, addr].filter(Boolean).join(", ") || null;
    }
    if (!location && /online/i.test(ev.eventAttendanceMode || "")) location = "Online";

    return {
      title: ev.name ?? null,
      description: typeof ev.description === "string" ? ev.description : null,
      startDate: ev.startDate ?? null,
      endDate: ev.endDate ?? null,
      location,
      host: ev.organizer?.name ?? (typeof ev.organizer === "string" ? ev.organizer : null),
      timezone: null,
    };
  }
  return null;
}

/** Luma embeds the event's IANA timezone in its page JSON, e.g. "timezone":"Europe/London". */
function parseTimezone(html: string): string | null {
  const m = html.match(/"timezone"\s*:\s*"([A-Za-z]+\/[A-Za-z_\-+/]+)"/);
  return m ? m[1] : null;
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

/** Fetch a Luma event page and pull out its event fields (JSON-LD first, OpenGraph fallback). */
async function fetchLumaEvent(url: string): Promise<LumaFields | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const html = await res.text();
  const timezone = parseTimezone(html);

  const ld = parseJsonLd(html);
  if (ld?.title) return { ...ld, timezone };

  // Fallback: OpenGraph tags. Luma sets og:title as "Event Name · Luma"-ish.
  const ogTitle = metaContent(html, "og:title");
  if (!ogTitle) return ld; // nothing usable
  return {
    title: ogTitle.replace(/\s*[·|]\s*Luma\s*$/i, "").trim(),
    description: metaContent(html, "og:description"),
    startDate: ld?.startDate ?? null,
    endDate: ld?.endDate ?? null,
    location: ld?.location ?? null,
    host: ld?.host ?? null,
    timezone,
  };
}

/**
 * For every message carrying a Luma link, fetch the event page and build a high-confidence
 * lead from the canonical event data — no LLM call, no token cost.
 */
export async function extractLumaLinks(messages: WaMessage[]): Promise<ExtractedLead[]> {
  const out: ExtractedLead[] = [];
  const seen = new Set<string>();

  for (const m of messages) {
    for (const url of findLumaUrls(m.text)) {
      if (seen.has(url)) continue;
      seen.add(url);
      const ev = await fetchLumaEvent(url);
      if (!ev?.title) continue; // couldn't resolve the page; let it fall through silently
      out.push({
        title: ev.title,
        description: summarize(ev.description) || `Shared in ${m.chatName}: ${url}`,
        startDate: ev.startDate,
        endDate: ev.endDate,
        timezone: ev.timezone,
        location: ev.location,
        lumaUrl: url,
        otherUrl: null,
        host: ev.host,
        // Canonical data straight from Luma → high confidence. Slightly lower if no date resolved.
        confidence: ev.startDate ? 0.95 : 0.8,
        sourceChat: m.chatName,
        sourceMsgId: m.id,
        sourceText: m.text,
      });
    }
  }
  return out;
}
