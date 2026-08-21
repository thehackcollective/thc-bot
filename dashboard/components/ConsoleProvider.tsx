"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface StreamOpts {
  title: string;
  url: string;
  body?: unknown;
}

interface ConsoleAPI {
  /** POST to `url`, stream the text response into the global console. Resolves when done. */
  stream: (opts: StreamOpts) => Promise<void>;
}

const Ctx = createContext<ConsoleAPI | null>(null);

export function useConsole(): ConsoleAPI {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConsole must be used within ConsoleProvider");
  return c;
}

export default function ConsoleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState("Console");
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(true);
  const [visible, setVisible] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text, open]);

  const stream = useCallback(async ({ title, url, body }: StreamOpts) => {
    setTitle(title);
    setText("");
    setRunning(true);
    setOpen(true);
    setVisible(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.body) throw new Error(`no stream from ${url}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        setText((t) => t + dec.decode(value, { stream: true }));
      }
    } catch (e) {
      setText((t) => t + `\n[client error] ${String(e)}\n`);
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <Ctx.Provider value={{ stream }}>
      {children}
      {visible && (
        <div className={`gconsole${open ? " open" : ""}`}>
          <div className="gconsole-head">
            <span className="gconsole-title">
              <span className={`led ${running ? "on" : "off"}`} />
              {title}
            </span>
            <span className="gconsole-actions">
              <button title={open ? "Collapse" : "Expand"} onClick={() => setOpen((o) => !o)}>
                {open ? "–" : "+"}
              </button>
              <button
                title="Close"
                onClick={() => {
                  setVisible(false);
                  setText("");
                }}
              >
                ×
              </button>
            </span>
          </div>
          {open && (
            <pre ref={preRef} className="gconsole-body">
              {text || "Starting…"}
            </pre>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
