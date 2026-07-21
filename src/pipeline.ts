import { config } from "./config.js";
import { fetchMessages, listGroups } from "./ingest/wacli.js";
import { extractEvents } from "./extract/events.js";
import { extractLumaLinks, hasLumaUrl } from "./extract/luma.js";
import { moderateMessages } from "./moderation/index.js";
import { getCursor, purgeOldRejects, setCursor, upsertFlags, upsertLeads } from "./queue/store.js";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

/** Ingest new messages from configured groups, extract events, queue them. */
export async function runPipeline(): Promise<{ scanned: number; inserted: number; flagged: number }> {
  const purged = purgeOldRejects(30);
  if (purged) console.log(`Purged ${purged} rejected lead(s) older than 30 days.`);

  const groups = await listGroups(config.waGroups);
  if (!groups.length) {
    console.warn("No matching groups. Check WA_GROUPS or that wacli is synced (`wacli sync`).");
    return { scanned: 0, inserted: 0, flagged: 0 };
  }
  const now = new Date().toISOString();
  let scanned = 0;
  let inserted = 0;
  let flagged = 0;

  for (const g of groups) {
    const since = getCursor(g.jid) || isoDaysAgo(config.ingestSinceDays);
    const messages = await fetchMessages(g, since);
    scanned += messages.length;
    console.log(`${g.name}: ${messages.length} new message(s) since ${since.slice(0, 10)}`);
    if (!messages.length) continue;

    // Messages carrying a Luma link get their event data straight from the Luma page
    // (canonical, no token cost); everything else goes to the LLM extractor.
    const lumaMsgs = messages.filter((m) => hasLumaUrl(m.text));
    const textMsgs = messages.filter((m) => !hasLumaUrl(m.text));
    // Moderation looks at every message (scams aren't events, so the extractor skips them).
    const [lumaLeads, textLeads, msgFlags] = await Promise.all([
      extractLumaLinks(lumaMsgs),
      extractEvents(textMsgs),
      moderateMessages(messages),
    ]);
    if (msgFlags.length) {
      const f = upsertFlags(msgFlags, now);
      flagged += f;
      if (f) console.log(`  ⚠ ${f} message(s) flagged (scam/spam) for review`);
    }
    // Luma-fetched leads first so they win URL-based dedupe over any weaker match.
    const leads = [...lumaLeads, ...textLeads];
    const real = leads.filter((l) => l.confidence >= config.confidenceThreshold);
    inserted += upsertLeads(real, now);
    console.log(
      `  → ${real.length} lead(s) (${lumaLeads.length} via Luma link), ${inserted} new after dedupe`,
    );

    const latest = messages.reduce((a, m) => (m.timestamp > a ? m.timestamp : a), since);
    setCursor(g.jid, latest);
  }
  return { scanned, inserted, flagged };
}
