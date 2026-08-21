/** Strip query/fragment and trailing slash, lowercase — so URL variants collapse. */
function normalizeUrl(u: string | null): string | null {
  if (!u) return null;
  return u.trim().replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
}

/**
 * Stable identity for a lead: prefer a normalized URL (Luma link, else other link),
 * otherwise fall back to title + start day. Used as the UNIQUE key on `leads`, so
 * re-seeing the same event in another group (or another scan) doesn't duplicate it.
 */
export function dedupeKey(l: {
  lumaUrl: string | null;
  otherUrl: string | null;
  title: string;
  startDate: string | null;
}): string {
  const url = normalizeUrl(l.lumaUrl) || normalizeUrl(l.otherUrl);
  if (url) return `url:${url}`;
  const day = (l.startDate || "").slice(0, 10);
  return `td:${l.title.trim().toLowerCase()}|${day}`;
}
