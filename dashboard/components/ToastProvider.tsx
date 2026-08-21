"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastKind = "info" | "ok" | "error";

interface Toast {
  id: number;
  msg: string;
  kind: ToastKind;
}

interface ToastAPI {
  toast: (msg: string, kind?: ToastKind, ms?: number) => void;
}

const Ctx = createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used within ToastProvider");
  return c;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((msg: string, kind: ToastKind = "info", ms?: number) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, msg, kind }]);
    // Errors linger; transient info/ok auto-dismiss.
    const life = ms ?? (kind === "error" ? 7000 : 2800);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), life);
  }, []);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role="status" onClick={() => dismiss(t.id)}>
            {t.kind === "error" ? "⚠ " : t.kind === "ok" ? "✓ " : ""}
            {t.msg}
            <span className="toast-x">×</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
