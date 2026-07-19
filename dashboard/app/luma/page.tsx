"use client";

import { useEffect, useState } from "react";

export default function LumaPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [calendarUrl, setCalendarUrl] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/luma/status")
      .then((r) => r.json())
      .then((j) => {
        setConnected(!!j.connected);
        setCalendarUrl(j.calendarUrl || "");
        setDryRun(!!j.dryRun);
      });
  }, []);

  async function save(patch: Record<string, unknown>) {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <>
      <div className="page-head">
        <h1>Luma</h1>
        <p>Where approved events land. The bot drives a real browser session (no paid Luma API needed) to create events on your calendar.</p>
      </div>

      <div className="panel">
        <div className="row" style={{ borderTop: "none", paddingTop: 0 }}>
          <div className="rl">
            Connection
            <small>A saved browser session lets the bot publish without logging in each time.</small>
          </div>
          <div className="pill" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`led ${connected ? "on" : "off"}`} />
            {connected === null ? "Checking…" : connected ? "Session saved" : "Not connected"}
          </div>
        </div>
        {!connected && (
          <p className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
            Connect once from a terminal: <span className="mono">npm run login</span> in the bot
            folder, sign into Luma in the window that opens, press ENTER. The session persists here.
          </p>
        )}
      </div>

      <div className="panel">
        <h3>Target calendar</h3>
        <p className="hint">
          Test on your own calendar first — the live THC calendar has limited slots.
        </p>
        <div className="field">
          <label>Calendar URL</label>
          <input
            type="url"
            placeholder="https://luma.com/your-calendar"
            value={calendarUrl}
            onChange={(e) => setCalendarUrl(e.target.value)}
            onBlur={() => save({ lumaCalendarUrl: calendarUrl })}
          />
        </div>
        <div className="row">
          <div className="rl">
            Dry run
            <small>Fill the Luma event form but don’t submit — safe for testing.</small>
          </div>
          <div
            className={`toggle${dryRun ? " on" : ""}`}
            role="switch"
            aria-checked={dryRun}
            onClick={() => {
              const v = !dryRun;
              setDryRun(v);
              save({ lumaDryRun: v });
            }}
          >
            <span className="knob" />
          </div>
        </div>
        {saved && <span className="saved">✓ Saved</span>}
      </div>
    </>
  );
}
