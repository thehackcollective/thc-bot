import { describe, expect, it } from "vitest";
import { findLumaUrls, hasLumaUrl, parseJsonLd, summarize } from "../src/extract/luma.js";

describe("findLumaUrls", () => {
  it("finds luma.com and lu.ma event links", () => {
    expect(findLumaUrls("come to https://luma.com/abc123 tonight")).toEqual([
      "https://luma.com/abc123",
    ]);
    expect(findLumaUrls("rsvp: https://lu.ma/xyz789")).toEqual(["https://lu.ma/xyz789"]);
    expect(findLumaUrls("http://www.luma.com/with-www")).toEqual(["http://www.luma.com/with-www"]);
  });

  it("finds multiple distinct links in one message and dedupes repeats", () => {
    const text = "two events: https://luma.com/aaa and https://lu.ma/bbb and https://luma.com/aaa";
    expect(findLumaUrls(text)).toEqual(["https://luma.com/aaa", "https://lu.ma/bbb"]);
  });

  it("skips non-event paths like /discover and /signin", () => {
    // These are Luma's own pages, not events — queueing them would create junk leads.
    for (const slug of ["discover", "signin", "create", "home", "settings", "u"]) {
      expect(findLumaUrls(`see https://luma.com/${slug}`)).toEqual([]);
    }
  });

  it("skips those paths case-insensitively but keeps real events", () => {
    expect(findLumaUrls("https://luma.com/DISCOVER")).toEqual([]);
    expect(findLumaUrls("https://luma.com/Discover")).toEqual([]);
    // A slug that merely starts with a skipped word is still a real event.
    expect(findLumaUrls("https://luma.com/discovery-day")).toEqual([
      "https://luma.com/discovery-day",
    ]);
  });

  it("ignores unrelated urls and plain text", () => {
    expect(findLumaUrls("https://example.com/luma")).toEqual([]);
    expect(findLumaUrls("no links here")).toEqual([]);
    expect(findLumaUrls("")).toEqual([]);
  });

  it("hasLumaUrl mirrors findLumaUrls", () => {
    expect(hasLumaUrl("https://luma.com/real-event")).toBe(true);
    expect(hasLumaUrl("https://luma.com/signin")).toBe(false);
    expect(hasLumaUrl("nothing")).toBe(false);
  });
});

describe("summarize", () => {
  it("passes through null and short text unchanged", () => {
    expect(summarize(null)).toBeNull();
    expect(summarize("Short description.")).toBe("Short description.");
  });

  it("collapses whitespace", () => {
    expect(summarize("lots   of\n\nwhitespace\there")).toBe("lots of whitespace here");
  });

  it("truncates long text at a sentence boundary when there is one", () => {
    const first = "A".repeat(120) + ". ";
    const out = summarize(first + "B".repeat(300), 220)!;
    expect(out.endsWith("…")).toBe(true);
    expect(out).toBe(first.trimEnd() + "…");
    expect(out).not.toContain("B");
  });

  it("falls back to a word boundary when no sentence end fits", () => {
    const text = ("word ".repeat(100)).trim();
    const out = summarize(text, 50)!;
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
    // Cut on whitespace, so the last kept token is whole.
    expect(out.slice(0, -1).trim().endsWith("word")).toBe(true);
  });
});

describe("parseJsonLd", () => {
  const wrap = (obj: unknown) =>
    `<html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head></html>`;

  it("reads a single Event object", () => {
    const html = wrap({
      "@type": "Event",
      name: "THC Hack Night",
      description: "An evening of building.",
      startDate: "2026-08-01T18:00:00Z",
      endDate: "2026-08-01T21:00:00Z",
      organizer: { name: "The Hack Collective" },
      location: { name: "Somewhere", address: { streetAddress: "1 Main St" } },
    });
    expect(parseJsonLd(html)).toEqual({
      title: "THC Hack Night",
      description: "An evening of building.",
      startDate: "2026-08-01T18:00:00Z",
      endDate: "2026-08-01T21:00:00Z",
      location: "Somewhere, 1 Main St",
      host: "The Hack Collective",
      timezone: null,
    });
  });

  it("finds the Event inside an array and inside @graph", () => {
    const asArray = wrap([{ "@type": "WebSite", name: "nope" }, { "@type": "Event", name: "Yes" }]);
    expect(parseJsonLd(asArray)?.title).toBe("Yes");

    const asGraph = wrap({ "@graph": [{ "@type": "Organization" }, { "@type": "Event", name: "G" }] });
    expect(parseJsonLd(asGraph)?.title).toBe("G");
  });

  it("matches subtypes of Event case-insensitively", () => {
    expect(parseJsonLd(wrap({ "@type": "SocialEvent", name: "Social" }))?.title).toBe("Social");
  });

  it("handles a string location and an online event", () => {
    expect(parseJsonLd(wrap({ "@type": "Event", name: "x", location: "The Pub" }))?.location).toBe(
      "The Pub",
    );
    const online = wrap({
      "@type": "Event",
      name: "x",
      eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    });
    expect(parseJsonLd(online)?.location).toBe("Online");
  });

  it("takes a string organizer and drops a non-string description", () => {
    const html = wrap({ "@type": "Event", name: "x", organizer: "Someone", description: { a: 1 } });
    const out = parseJsonLd(html)!;
    expect(out.host).toBe("Someone");
    expect(out.description).toBeNull();
  });

  it("returns null when there is no JSON-LD, no Event, or malformed JSON", () => {
    expect(parseJsonLd("<html></html>")).toBeNull();
    expect(parseJsonLd(wrap({ "@type": "WebPage", name: "nope" }))).toBeNull();
    expect(
      parseJsonLd('<script type="application/ld+json">{not json}</script>'),
    ).toBeNull();
  });

  it("skips a malformed block and still reads a later valid one", () => {
    const html =
      '<script type="application/ld+json">{broken</script>' +
      `<script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: "Later" })}</script>`;
    expect(parseJsonLd(html)?.title).toBe("Later");
  });
});
