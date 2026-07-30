import { describe, expect, it } from "vitest";
import { normalizeChat, normalizeMessage, parseJsonOutput } from "../src/ingest/wacli-parse.js";

describe("parseJsonOutput", () => {
  it("returns [] for empty or whitespace output", () => {
    expect(parseJsonOutput("")).toEqual([]);
    expect(parseJsonOutput("   \n  ")).toEqual([]);
  });

  it("passes a bare JSON array through", () => {
    expect(parseJsonOutput('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("unwraps {success,data:[...]}", () => {
    expect(parseJsonOutput('{"success":true,"data":[{"jid":"x"}]}')).toEqual([{ jid: "x" }]);
  });

  it("unwraps a nested data.messages / data.chats collection", () => {
    expect(parseJsonOutput('{"success":true,"data":{"messages":[{"id":"1"}]}}')).toEqual([
      { id: "1" },
    ]);
    expect(parseJsonOutput('{"data":{"chats":[{"jid":"g@g.us"}]}}')).toEqual([{ jid: "g@g.us" }]);
    expect(parseJsonOutput('{"data":{"items":[1,2]}}')).toEqual([1, 2]);
    expect(parseJsonOutput('{"data":{"results":[3]}}')).toEqual([3]);
  });

  it("unwraps top-level items/messages/chats collections", () => {
    expect(parseJsonOutput('{"items":[1]}')).toEqual([1]);
    expect(parseJsonOutput('{"messages":[{"id":"m"}]}')).toEqual([{ id: "m" }]);
    expect(parseJsonOutput('{"chats":[{"jid":"c"}]}')).toEqual([{ jid: "c" }]);
  });

  it("wraps a lone object as a single row (e.g. `store stats`)", () => {
    expect(parseJsonOutput('{"messages":42,"other":1}')).toEqual([{ messages: 42, other: 1 }]);
  });

  it("throws on an explicit wacli failure", () => {
    expect(() => parseJsonOutput('{"success":false,"error":"not authed"}')).toThrow(
      /wacli error: not authed/,
    );
    expect(() => parseJsonOutput('{"success":false}')).toThrow(/wacli error: unknown/);
  });

  it("falls back to NDJSON", () => {
    expect(parseJsonOutput('{"id":"1"}\n{"id":"2"}')).toEqual([{ id: "1" }, { id: "2" }]);
  });

  it("skips malformed NDJSON lines instead of aborting the whole fetch", () => {
    // A stray wacli progress line must not lose the surrounding real messages.
    const out = parseJsonOutput('{"id":"1"}\nsyncing... 40%\n{"id":"2"}\n\n{"id":"3"}');
    expect(out).toEqual([{ id: "1" }, { id: "2" }, { id: "3" }]);
  });

  it("returns [] when every NDJSON line is unparseable", () => {
    expect(parseJsonOutput("progress 10%\nprogress 20%")).toEqual([]);
  });
});

describe("normalizeChat", () => {
  it("detects a group by the @g.us suffix and falls back to jid for the name", () => {
    expect(normalizeChat({ jid: "123@g.us" })).toEqual({
      jid: "123@g.us",
      name: "123@g.us",
      isGroup: true,
    });
  });

  it("detects a group by kind or an is_group flag", () => {
    expect(normalizeChat({ jid: "x", kind: "group", name: "Builders" })).toEqual({
      jid: "x",
      name: "Builders",
      isGroup: true,
    });
    expect(normalizeChat({ jid: "y", is_group: true }).isGroup).toBe(true);
    expect(normalizeChat({ jid: "z", isGroup: true }).isGroup).toBe(true);
  });

  it("treats a 1:1 chat as not a group", () => {
    expect(normalizeChat({ jid: "44700@s.whatsapp.net", name: "Ada" })).toEqual({
      jid: "44700@s.whatsapp.net",
      name: "Ada",
      isGroup: false,
    });
  });

  it("accepts the alternate jid and name key spellings", () => {
    expect(normalizeChat({ chat_jid: "a@g.us", subject: "Subj" })).toEqual({
      jid: "a@g.us",
      name: "Subj",
      isGroup: true,
    });
    expect(normalizeChat({ id: "b@g.us", display_name: "Disp" }).name).toBe("Disp");
  });

  it("survives a row with no usable fields", () => {
    expect(normalizeChat({})).toEqual({ jid: "", name: "", isGroup: false });
  });
});

describe("normalizeMessage", () => {
  // wacli's two surfaces name the same fields differently; both must normalize identically.
  it("reads the `messages list` shape (PascalCase)", () => {
    const out = normalizeMessage(
      {
        MsgID: "M1",
        ChatJID: "g@g.us",
        ChatName: "Builders",
        SenderName: "Ada",
        SenderJID: "44700@s.whatsapp.net",
        Timestamp: "2026-07-20T10:00:00Z",
        Text: "hello",
      },
      "fallback",
    );
    expect(out).toEqual({
      id: "M1",
      chatJid: "g@g.us",
      chatName: "Builders",
      sender: "Ada",
      senderJid: "44700@s.whatsapp.net",
      timestamp: "2026-07-20T10:00:00.000Z",
      text: "hello",
    });
  });

  it("reads the sync-webhook shape (ID/Chat/PushName)", () => {
    const out = normalizeMessage(
      {
        ID: "W1",
        Chat: "g2@g.us",
        PushName: "Grace",
        Timestamp: "2026-07-20T11:30:00Z",
        Text: "hi from webhook",
      },
      "Chat Name",
    );
    expect(out.id).toBe("W1");
    expect(out.chatJid).toBe("g2@g.us");
    expect(out.sender).toBe("Grace");
    // No ChatName key on this shape, so the passed-in chat name is used.
    expect(out.chatName).toBe("Chat Name");
    expect(out.text).toBe("hi from webhook");
  });

  it("converts second and millisecond epoch timestamps", () => {
    expect(normalizeMessage({ Timestamp: 1_753_000_000, Text: "s" }, "c").timestamp).toBe(
      new Date(1_753_000_000_000).toISOString(),
    );
    expect(normalizeMessage({ Timestamp: 1_753_000_000_000, Text: "ms" }, "c").timestamp).toBe(
      new Date(1_753_000_000_000).toISOString(),
    );
  });

  it("falls back to the epoch when there is no timestamp", () => {
    expect(normalizeMessage({ Text: "x" }, "c").timestamp).toBe(new Date(0).toISOString());
  });

  it("falls back to a media caption, then to empty text", () => {
    expect(normalizeMessage({ MediaCaption: "a photo" }, "c").text).toBe("a photo");
    expect(normalizeMessage({ DisplayText: "(message)" }, "c").text).toBe("");
  });

  it("defaults an unknown sender and a missing senderJid", () => {
    const out = normalizeMessage({ Text: "x" }, "c");
    expect(out.sender).toBe("unknown");
    expect(out.senderJid).toBe("");
  });

  it("stringifies a numeric id", () => {
    expect(normalizeMessage({ id: 12345, Text: "x" }, "c").id).toBe("12345");
  });
});
