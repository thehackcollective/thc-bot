import { describe, expect, it } from "vitest";
import { dedupeKey } from "../src/queue/dedupe.js";

const lead = (over: Partial<Parameters<typeof dedupeKey>[0]> = {}) => ({
  lumaUrl: null,
  otherUrl: null,
  title: "Some Event",
  startDate: null,
  ...over,
});

describe("dedupeKey", () => {
  it("prefers the Luma URL over the other URL", () => {
    expect(
      dedupeKey(lead({ lumaUrl: "https://luma.com/abc", otherUrl: "https://eventbrite.com/x" })),
    ).toBe("url:https://luma.com/abc");
  });

  it("uses the other URL when there is no Luma URL", () => {
    expect(dedupeKey(lead({ otherUrl: "https://eventbrite.com/x" }))).toBe(
      "url:https://eventbrite.com/x",
    );
  });

  it("collapses query strings, fragments, trailing slashes and case", () => {
    const canonical = "url:https://luma.com/abc";
    for (const u of [
      "https://luma.com/abc",
      "https://luma.com/abc/",
      "https://luma.com/abc?utm_source=whatsapp",
      "https://luma.com/abc#details",
      "https://LUMA.com/ABC",
      "  https://luma.com/abc  ",
    ]) {
      expect(dedupeKey(lead({ lumaUrl: u }))).toBe(canonical);
    }
  });

  it("falls back to title + start day when there is no URL", () => {
    expect(dedupeKey(lead({ title: "Hack Night", startDate: "2026-08-01T18:00:00Z" }))).toBe(
      "td:hack night|2026-08-01",
    );
  });

  it("treats the same title on the same day as one event regardless of time", () => {
    const a = dedupeKey(lead({ title: "Hack Night", startDate: "2026-08-01T18:00:00Z" }));
    const b = dedupeKey(lead({ title: "  hack NIGHT ", startDate: "2026-08-01T20:30:00Z" }));
    expect(a).toBe(b);
  });

  it("separates the same title on different days", () => {
    const a = dedupeKey(lead({ title: "Hack Night", startDate: "2026-08-01T18:00:00Z" }));
    const b = dedupeKey(lead({ title: "Hack Night", startDate: "2026-08-08T18:00:00Z" }));
    expect(a).not.toBe(b);
  });

  it("handles a missing start date", () => {
    expect(dedupeKey(lead({ title: "Undated" }))).toBe("td:undated|");
  });

  it("ignores an empty-string URL", () => {
    expect(dedupeKey(lead({ lumaUrl: "", title: "Fallback" }))).toBe("td:fallback|");
  });
});
