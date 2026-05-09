"use client";
import { useEffect, useState } from "react";
import Pusher from "pusher-js";

type Toast = { id: string; type: string; line: string; at: string };

export const PusherToast = (): React.JSX.Element => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const p = new Pusher(key, { cluster });
    const channels = ["activity", "opportunities", "merges", "blockers"] as const;
    const subs = channels.map((name) => {
      const ch = p.subscribe(name);
      ch.bind_global((event: string, data: unknown) => {
        if (event.startsWith("pusher:")) return;
        const obj = (typeof data === "object" && data) ? (data as Record<string, unknown>) : {};
        const line =
          typeof obj["title"] === "string" ? String(obj["title"]) :
          typeof obj["filename"] === "string" ? String(obj["filename"]) :
          typeof obj["phase"] === "string" ? String(obj["phase"]) :
          typeof obj["prNumber"] === "number" ? `#${obj["prNumber"]}` :
          name;
        const id = Math.random().toString(36).slice(2);
        const at = new Date().toLocaleTimeString();
        setToasts((cur) => [...cur, { id, type: event, line, at }].slice(-6));
        setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 7000);
      });
      return ch;
    });
    return () => {
      subs.forEach((c) => c.unbind_all());
      p.disconnect();
    };
  }, []);

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="t-type">{t.type}</span>
          {t.line}
          <span className="t-time">{t.at}</span>
        </div>
      ))}
    </div>
  );
};
