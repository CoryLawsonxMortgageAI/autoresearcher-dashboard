// Inline banner for pages that show DB-backed data when the deploy is
// running in demo mode (no DATABASE_URL set). Lets the operator click
// through to the chat which works without DB.

import Link from "next/link";

export const DemoBanner = ({ kind }: { kind: "no-db" | "no-llm" | "no-auth" }): React.JSX.Element => {
  const cfg = {
    "no-db": {
      tag: "demo",
      color: "var(--amber)",
      bg: "#3a2a00",
      title: "demo mode — DATABASE_URL not set",
      body:
        "This deploy doesn't have a database connected, so DB-backed pages can't show data. " +
        "The chat works without DB — try /chat. To enable this page, set DATABASE_URL in " +
        "Vercel project env (Settings → Environment Variables → Production), redeploy, " +
        "then run pnpm db:migrate against it.",
    },
    "no-llm": {
      tag: "no llm",
      color: "var(--red)",
      bg: "var(--red-dim)",
      title: "no LLM key set",
      body:
        "Set OPENROUTER_API_KEY (or ANTHROPIC_API_KEY) in Vercel project env to enable agent paths.",
    },
    "no-auth": {
      tag: "no auth",
      color: "var(--amber)",
      bg: "#3a2a00",
      title: "JWT_SIGNING_KEY not set",
      body:
        "Operator authentication is unavailable. Set JWT_SIGNING_KEY (≥32 chars) in Vercel " +
        "project env to enable greenlights, magic links, and the persisted /chat.",
    },
  }[kind];

  return (
    <div className="card" style={{ borderLeft: `2px solid ${cfg.color}`, background: cfg.bg }}>
      <span className="tag" style={{ color: cfg.color }}>{cfg.tag}</span>
      <span style={{ marginLeft: 8, color: "var(--fg)" }}>{cfg.title}</span>
      <div style={{ marginTop: 6, color: "var(--fg-dim)", fontSize: 12 }}>{cfg.body}</div>
      {kind === "no-db" && (
        <div style={{ marginTop: 8, fontSize: 11 }}>
          → <Link href="/chat" style={{ color: "var(--cyan)" }}>open /chat (works in demo mode)</Link>
        </div>
      )}
    </div>
  );
};
