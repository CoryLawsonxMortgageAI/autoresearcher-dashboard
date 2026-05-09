"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function MagicPage() {
  const sp = useSearchParams();
  const [status, setStatus] = useState<"working" | "ok" | "err">("working");
  const [detail, setDetail] = useState<string>("");

  useEffect(() => {
    const token = sp?.get("t");
    if (!token) { setStatus("err"); setDetail("no token"); return; }
    void (async () => {
      try {
        const res = await fetch("/proxy/api/magic/consume", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "unknown");
        setStatus("ok");
        setDetail(`${json.purpose ?? ""} · ${json.subjectId ?? ""}`);
      } catch (e) {
        setStatus("err");
        setDetail(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [sp]);

  return (
    <>
      <div className="head"><h1>/magic</h1></div>
      <div className="card">
        {status === "working" && <span className="tag">consuming…</span>}
        {status === "ok" && <><span className="tag green">ok</span> <span style={{ marginLeft: 8 }}>{detail}</span></>}
        {status === "err" && <><span className="tag red">err</span> <span style={{ marginLeft: 8 }}>{detail}</span></>}
      </div>
    </>
  );
}
