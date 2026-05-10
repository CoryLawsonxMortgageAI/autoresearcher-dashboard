"use client";
import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "../../lib/markdown";

type Message = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }> | null;
};

type ToolEvent = {
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  expanded?: boolean;
};

type Conversation = { id: string; title: string; updatedAt: string };

type Health = {
  demo: boolean;
  ready: { db: boolean; auth: boolean; llm: boolean };
  llm: { provider: "anthropic" | "openrouter" | "none"; modelId: string | null };
};

export default function ChatPage() {
  const [token, setToken] = useState<string>("");
  const [health, setHealth] = useState<Health | null>(null);
  const [demoHistory, setDemoHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);
  const [streamBuf, setStreamBuf] = useState<string>("");
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [tokensLastTurn, setTokensLastTurn] = useState<{ in: number; out: number; cents: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("operatorJwt") : null;
    if (t) setToken(t);
    void (async () => {
      try {
        const r = await fetch("/api/health");
        if (r.ok) setHealth((await r.json()) as Health);
      } catch {/* ignore */}
    })();
  }, []);

  useEffect(() => {
    if (!token || health?.demo) return;
    void refreshConversations();
  }, [token, health?.demo]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamBuf, toolEvents]);

  const refreshConversations = async (): Promise<void> => {
    try {
      const r = await fetch("/api/chat/conversations", { headers: authHeaders() });
      if (!r.ok) return;
      const j = (await r.json()) as { items: Conversation[] };
      setConvs(j.items);
    } catch {/* ignore */}
  };

  const authHeaders = (): Record<string, string> => ({
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  });

  const newConversation = async (): Promise<void> => {
    const title = window.prompt("Conversation title?", "scratchpad") ?? "scratchpad";
    const r = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title }),
    });
    if (!r.ok) return;
    const j = (await r.json()) as { id: string };
    await refreshConversations();
    await openConversation(j.id);
  };

  const openConversation = async (id: string): Promise<void> => {
    setActiveId(id);
    setMessages([]);
    setToolEvents([]);
    setStreamBuf("");
    setTokensLastTurn(null);
    const r = await fetch(`/api/chat/conversations/${id}`, { headers: authHeaders() });
    if (!r.ok) return;
    const j = (await r.json()) as { messages: Message[] };
    setMessages(j.messages);
  };

  const stop = (): void => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreaming(false);
  };

  const send = async (): Promise<void> => {
    const isDemo = !!health?.demo;
    if (!isDemo && !activeId) return;
    if (!draft.trim() || streaming) return;
    const message = draft.trim();
    setDraft("");
    setStreaming(true);
    setStreamBuf("");
    setToolEvents([]);
    setTokensLastTurn(null);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: message }]);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const r = isDemo
        ? await fetch("/api/chat/quick", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message, history: demoHistory }),
            signal: ac.signal,
          })
        : await fetch("/api/chat/send", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ conversationId: activeId, message }),
            signal: ac.signal,
          });
      if (!r.ok || !r.body) {
        if (r.status === 429) {
          setMessages((m) => [...m, { id: `local-err-${Date.now()}`, role: "assistant", content: "_(rate limited — slow down a moment)_" }]);
        }
        setStreaming(false);
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistant = "";
      const localTools: ToolEvent[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const lines = ev.split("\n");
          let name = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) name = line.slice(6).trim();
            if (line.startsWith("data:")) data = line.slice(5).trim();
          }
          try {
            const obj = JSON.parse(data);
            if (name === "text") { assistant += obj.text ?? ""; setStreamBuf(assistant); }
            else if (name === "tool") { localTools.push({ name: obj.name, input: obj.input as Record<string, unknown> }); setToolEvents([...localTools]); }
            else if (name === "result") {
              const i = localTools.findIndex((t) => typeof t.output === "undefined");
              const target = i >= 0 ? localTools[i] : undefined;
              if (target) localTools[i] = { name: target.name, input: target.input, output: obj.output };
              setToolEvents([...localTools]);
            } else if (name === "done") {
              setTokensLastTurn({ in: obj.inputTokens ?? 0, out: obj.outputTokens ?? 0, cents: obj.costCents ?? "0" });
            } else if (name === "error") {
              setMessages((m) => [...m, { id: `local-err-${Date.now()}`, role: "assistant", content: `_(error: ${String(obj.error ?? "unknown")})_` }]);
            }
          } catch {/* ignore parse errors on partial frames */}
        }
      }
      if (assistant) {
        setMessages((m) => [...m, { id: `local-asst-${Date.now()}`, role: "assistant", content: assistant }]);
        if (isDemo) setDemoHistory((h) => [
          ...h,
          { role: "user" as const, content: message },
          { role: "assistant" as const, content: assistant },
        ].slice(-20));
      }
      setStreamBuf("");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages((m) => [...m, { id: `local-abort-${Date.now()}`, role: "assistant", content: "_(stopped)_" }]);
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  };

  const toggleTool = (i: number): void => {
    setToolEvents((cur) => cur.map((t, idx) => (idx === i ? { ...t, expanded: !t.expanded } : t)));
  };

  // Demo mode: skip JWT entry; chat works directly against /api/chat/quick.
  if (health?.demo) {
    return renderDemoChat({
      health,
      messages,
      streaming,
      streamBuf,
      toolEvents,
      tokensLastTurn,
      draft,
      scrollRef,
      setDraft,
      send,
      stop,
      toggleTool,
    });
  }

  if (!token) {
    return (
      <>
        <div className="head"><h1>/chat</h1></div>
        <div className="card">
          Set an operator JWT to use chat. Run <code>pnpm operator-jwt &lt;your_user_id&gt;</code>{" "}
          and paste the result below. Stored in localStorage.
          <div style={{ marginTop: 12 }}>
            <input
              type="text"
              placeholder="paste operator JWT…"
              style={{ width: "100%", padding: 8, background: "var(--bg-2)", color: "var(--fg)", border: "1px solid var(--line-1)", fontFamily: "var(--mono)", fontSize: 12 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) {
                    localStorage.setItem("operatorJwt", v);
                    setToken(v);
                  }
                }
              }}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="head">
        <h1>/chat</h1>
        <div className="meta">
          {convs.length} conversations · tool-use enabled
          {tokensLastTurn && (
            <span style={{ marginLeft: 12 }}>
              · last turn: {tokensLastTurn.in} in · {tokensLastTurn.out} out · ${(Number(tokensLastTurn.cents) / 100).toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16 }}>
        <aside style={{ borderRight: "1px solid var(--line)", paddingRight: 12 }}>
          <button onClick={() => void newConversation()} style={{ width: "100%", marginBottom: 12 }}>+ new</button>
          {convs.map((c) => (
            <div
              key={c.id}
              onClick={() => void openConversation(c.id)}
              style={{
                padding: "6px 8px",
                cursor: "pointer",
                fontSize: 12,
                color: c.id === activeId ? "var(--fg)" : "var(--fg-dim)",
                background: c.id === activeId ? "var(--bg-1)" : "transparent",
                borderLeft: `2px solid ${c.id === activeId ? "var(--green)" : "transparent"}`,
              }}
            >
              {c.title}
            </div>
          ))}
        </aside>

        <section>
          {!activeId && <div className="empty">select or create a conversation</div>}
          {activeId && (
            <>
              <div ref={scrollRef} style={{ maxHeight: "60vh", overflowY: "auto", marginBottom: 12, padding: 12, background: "var(--bg-1)", border: "1px solid var(--line)", borderRadius: 4 }}>
                {messages.map((m) => (
                  <div key={m.id} style={{ marginBottom: 12 }}>
                    <span className={`tag ${m.role === "user" ? "cyan" : m.role === "assistant" ? "green" : ""}`}>{m.role}</span>
                    {m.role === "assistant" ? (
                      <div className="md" style={{ marginTop: 6, color: "var(--fg)" }} dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                    ) : (
                      <div style={{ marginTop: 4, whiteSpace: "pre-wrap", color: "var(--fg)" }}>{m.content}</div>
                    )}
                  </div>
                ))}
                {streaming && streamBuf && (
                  <div>
                    <span className="tag green">assistant</span>
                    <div className="md" style={{ marginTop: 6, color: "var(--fg)" }} dangerouslySetInnerHTML={{ __html: renderMarkdown(streamBuf) }} />
                  </div>
                )}
                {streaming && !streamBuf && toolEvents.length === 0 && (
                  <div style={{ marginTop: 6, color: "var(--fg-muted)", fontSize: 12 }}>thinking…</div>
                )}
                {toolEvents.length > 0 && (
                  <div style={{ marginTop: 12, borderTop: "1px dashed var(--line-1)", paddingTop: 8 }}>
                    {toolEvents.map((t, i) => (
                      <div key={i} style={{ fontSize: 11, marginBottom: 4 }}>
                        <span
                          style={{ cursor: "pointer", color: "var(--fg-muted)" }}
                          onClick={() => toggleTool(i)}
                        >
                          <span className="tag amber">tool</span> {t.name}{" "}
                          <span style={{ color: "var(--fg-faint)" }}>{t.expanded ? "▾" : "▸"}</span>
                          {typeof t.output !== "undefined" && (
                            <span style={{ marginLeft: 6, color: "var(--fg-dim)" }}>→ {summariseOutput(t.output)}</span>
                          )}
                        </span>
                        {t.expanded && (
                          <div style={{ marginTop: 4, marginLeft: 24 }}>
                            <pre style={{ fontSize: 10, color: "var(--fg-dim)", padding: 6, background: "var(--bg-2)", overflowX: "auto" }}>
                              input: {JSON.stringify(t.input, null, 2)}
                            </pre>
                            {typeof t.output !== "undefined" && (
                              <pre style={{ fontSize: 10, color: "var(--fg-dim)", padding: 6, background: "var(--bg-2)", overflowX: "auto" }}>
                                output: {JSON.stringify(t.output, null, 2).slice(0, 4000)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="ask the agents to research, run scout, review opportunities, search past evidence, etc."
                  rows={3}
                  disabled={streaming}
                  style={{ flex: 1, padding: 8, background: "var(--bg-2)", color: "var(--fg)", border: "1px solid var(--line-1)", fontFamily: "var(--mono)", fontSize: 12, resize: "vertical" }}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(); }}
                />
                {streaming ? (
                  <button className="danger" onClick={stop}>stop</button>
                ) : (
                  <button className="primary" disabled={!draft.trim()} onClick={() => void send()}>send</button>
                )}
              </div>
              <div style={{ fontSize: 10, color: "var(--fg-faint)", marginTop: 4 }}>
                cmd/ctrl+enter to send · ask: "summarize the inbox" · "search evidence for NMLS" · "mint greenlight link for &lt;id&gt;"
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

type DemoChatProps = {
  health: Health;
  messages: Message[];
  streaming: boolean;
  streamBuf: string;
  toolEvents: ToolEvent[];
  tokensLastTurn: { in: number; out: number; cents: string } | null;
  draft: string;
  scrollRef: React.RefObject<HTMLDivElement>;
  setDraft: (v: string) => void;
  send: () => Promise<void>;
  stop: () => void;
  toggleTool: (i: number) => void;
};

const renderDemoChat = (p: DemoChatProps): React.JSX.Element => {
  const banner = !p.health.ready.llm
    ? { color: "var(--red)", text: "no LLM key set on this deploy — chat will 500. Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in Vercel project env." }
    : { color: "var(--amber)", text: `demo mode (no DB) · provider: ${p.health.llm.provider} · DB-touching tools return a friendly degraded message.` };

  return (
    <>
      <div className="head">
        <h1>/chat</h1>
        <div className="meta">
          {p.health.llm.provider} · {p.health.llm.modelId ?? "no model"}
          {p.tokensLastTurn && (
            <span style={{ marginLeft: 12 }}>
              · last turn: {p.tokensLastTurn.in} in · {p.tokensLastTurn.out} out · ${(Number(p.tokensLastTurn.cents) / 100).toFixed(3)}
            </span>
          )}
        </div>
      </div>

      <div className="card" style={{ borderLeft: `2px solid ${banner.color}` }}>
        <span className="tag" style={{ color: banner.color }}>{p.health.ready.llm ? "demo" : "no key"}</span>
        <span style={{ marginLeft: 8 }}>{banner.text}</span>
      </div>

      <div ref={p.scrollRef} style={{ maxHeight: "60vh", overflowY: "auto", marginBottom: 12, padding: 12, background: "var(--bg-1)", border: "1px solid var(--line)", borderRadius: 4 }}>
        {p.messages.length === 0 && (
          <div className="empty">
            ask anything. examples:
            <div style={{ marginTop: 8, color: "var(--fg-dim)" }}>
              · "what skills do you have?"<br />
              · "explain the autoresearcher's scoring system"<br />
              · "search skills for compliance"<br />
              · "what's in the prompt bank?"<br />
              · "what would you do differently in phase 0?"
            </div>
          </div>
        )}
        {p.messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 12 }}>
            <span className={`tag ${m.role === "user" ? "cyan" : m.role === "assistant" ? "green" : ""}`}>{m.role}</span>
            {m.role === "assistant" ? (
              <div className="md" style={{ marginTop: 6, color: "var(--fg)" }} dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
            ) : (
              <div style={{ marginTop: 4, whiteSpace: "pre-wrap", color: "var(--fg)" }}>{m.content}</div>
            )}
          </div>
        ))}
        {p.streaming && p.streamBuf && (
          <div>
            <span className="tag green">assistant</span>
            <div className="md" style={{ marginTop: 6, color: "var(--fg)" }} dangerouslySetInnerHTML={{ __html: renderMarkdown(p.streamBuf) }} />
          </div>
        )}
        {p.streaming && !p.streamBuf && p.toolEvents.length === 0 && (
          <div style={{ marginTop: 6, color: "var(--fg-muted)", fontSize: 12 }}>thinking…</div>
        )}
        {p.toolEvents.length > 0 && (
          <div style={{ marginTop: 12, borderTop: "1px dashed var(--line-1)", paddingTop: 8 }}>
            {p.toolEvents.map((t, i) => (
              <div key={i} style={{ fontSize: 11, marginBottom: 4 }}>
                <span style={{ cursor: "pointer", color: "var(--fg-muted)" }} onClick={() => p.toggleTool(i)}>
                  <span className="tag amber">tool</span> {t.name}{" "}
                  <span style={{ color: "var(--fg-faint)" }}>{t.expanded ? "▾" : "▸"}</span>
                  {typeof t.output !== "undefined" && (
                    <span style={{ marginLeft: 6, color: "var(--fg-dim)" }}>→ {summariseOutput(t.output)}</span>
                  )}
                </span>
                {t.expanded && (
                  <div style={{ marginTop: 4, marginLeft: 24 }}>
                    <pre style={{ fontSize: 10, color: "var(--fg-dim)", padding: 6, background: "var(--bg-2)", overflowX: "auto" }}>input: {JSON.stringify(t.input, null, 2)}</pre>
                    {typeof t.output !== "undefined" && (
                      <pre style={{ fontSize: 10, color: "var(--fg-dim)", padding: 6, background: "var(--bg-2)", overflowX: "auto" }}>output: {JSON.stringify(t.output, null, 2).slice(0, 4000)}</pre>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          value={p.draft}
          onChange={(e) => p.setDraft(e.target.value)}
          placeholder="ask anything about the autoresearcher, the skills, the prompt bank, or how the system works…"
          rows={3}
          disabled={p.streaming}
          style={{ flex: 1, padding: 8, background: "var(--bg-2)", color: "var(--fg)", border: "1px solid var(--line-1)", fontFamily: "var(--mono)", fontSize: 12, resize: "vertical" }}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void p.send(); }}
        />
        {p.streaming ? (
          <button className="danger" onClick={p.stop}>stop</button>
        ) : (
          <button className="primary" disabled={!p.draft.trim()} onClick={() => void p.send()}>send</button>
        )}
      </div>
      <div style={{ fontSize: 10, color: "var(--fg-faint)", marginTop: 4 }}>
        cmd/ctrl+enter to send · demo mode is rate-limited (4 burst, 1 per 6s) · history kept in browser, not persisted
      </div>
    </>
  );
};

const summariseOutput = (output: unknown): string => {
  if (Array.isArray(output)) return `${output.length} item(s)`;
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if ("error" in o) return `error: ${String(o["error"]).slice(0, 80)}`;
    if ("hits" in o && Array.isArray(o["hits"])) return `${(o["hits"] as unknown[]).length} hit(s)`;
    if ("inboxCount" in o) return `inbox=${o["inboxCount"]}`;
    if ("opportunityIds" in o && Array.isArray(o["opportunityIds"])) return `${(o["opportunityIds"] as unknown[]).length} new opps`;
    if ("verdict" in o) return `verdict: ${String(o["verdict"])}`;
    if ("url" in o) return `link minted`;
    return Object.keys(o).slice(0, 3).join(", ");
  }
  return String(output).slice(0, 80);
};
