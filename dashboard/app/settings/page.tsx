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

      {saved && <div className="toast">✓ Saved</div>}
    </>
  );
}
