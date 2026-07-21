"use client";

import { useEffect, useState } from "react";
import type { Settings } from "@/lib/settings";

const MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"];

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setS);
  }, []);

  async function save(patch: Partial<Settings>) {
    const next = { ...(s as Settings), ...patch };
    setS(next);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  }

  if (!s) return <p className="mono">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
        <p>Extraction and ingestion controls. Saved instantly and picked up on the next bot run.</p>
      </div>

      <div className="panel">
        <h3>Extraction</h3>
        <p className="hint">How the model turns messages into event leads.</p>

        <div className="field">
          <label>OpenAI model</label>
          <select value={s.openaiModel} onChange={(e) => save({ openaiModel: e.target.value })}>
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Confidence threshold — {Math.round(s.confidenceThreshold * 100)}%</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.confidenceThreshold}
            onChange={(e) => setS({ ...s, confidenceThreshold: Number(e.target.value) })}
            onMouseUp={(e) => save({ confidenceThreshold: Number((e.target as HTMLInputElement).value) })}
            onTouchEnd={(e) => save({ confidenceThreshold: Number((e.target as HTMLInputElement).value) })}
          />
          <small style={{ color: "var(--text-faint)", fontSize: 12.5 }}>
            Leads below this are dropped before they reach the queue.
          </small>
        </div>
      </div>

      <div className="panel">
        <h3>Ingestion</h3>
        <p className="hint">How far back the bot reads when scanning WhatsApp.</p>
        <div className="field">
          <label>Look-back window (days)</label>
          <input
            type="number"
            min={1}
            max={365}
            value={s.ingestSinceDays}
            onChange={(e) => setS({ ...s, ingestSinceDays: Number(e.target.value) })}
            onBlur={() => save({ ingestSinceDays: s.ingestSinceDays })}
          />
        </div>
      </div>

      <div className="panel">
        <h3>
          Moderation <span className="beta-tag">beta</span>
        </h3>
        <p className="hint">
          Flag scam/spam messages (account resale, fake deals) into the Moderation queue. Detection
          only, unless you turn on WhatsApp actions below.
        </p>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={s.moderationEnabled}
              onChange={(e) => save({ moderationEnabled: e.target.checked })}
              style={{ marginRight: 8 }}
            />
            Enable scam/spam flagging
          </label>
        </div>
        <div className="field">
          <label>Flag threshold — {Math.round(s.moderationThreshold * 100)}%</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.moderationThreshold}
            onChange={(e) => setS({ ...s, moderationThreshold: Number(e.target.value) })}
            onMouseUp={(e) => save({ moderationThreshold: Number((e.target as HTMLInputElement).value) })}
            onTouchEnd={(e) => save({ moderationThreshold: Number((e.target as HTMLInputElement).value) })}
          />
          <small style={{ color: "var(--text-faint)", fontSize: 12.5 }}>
            Borderline messages the model scores below this are not flagged. Obvious spam is always flagged.
          </small>
        </div>

        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={s.moderationActionsEnabled}
              // No window.confirm() here: browsers suppress repeated native dialogs,
              // which would silently drop the change. Each action confirms in-page.
              onChange={(e) => save({ moderationActionsEnabled: e.target.checked })}
              style={{ marginRight: 8 }}
            />
            Allow WhatsApp actions (delete message / remove sender)
          </label>
          <small style={{ color: "var(--text-faint)", fontSize: 12.5 }}>
            Off by default. The bot never acts on its own — actions only run when you click them in
            the Moderation queue, each behind its own confirmation, and they cannot be undone.
            Both need the bot account to be a group admin, and WhatsApp only allows deleting
            messages that this account itself sent.
          </small>
        </div>
      </div>

      {saved && <div className="toast">✓ Saved</div>}
    </>
  );
}
