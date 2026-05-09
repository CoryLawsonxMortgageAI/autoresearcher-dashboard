// Operator chat agent. Tool-use over the autoresearcher's existing
// surfaces: SCOUT, CRITIC, opportunity search, skills, reflections,
// HISTORIAN. Per directive, we never expose Tier-3 actions through chat —
// chat can READ everything but can WRITE only `inbox`-status changes
// directly. Greenlight goes through a *minted magic link* the operator
// must click — the link's userId is the operator's sub from their JWT,
// so the resulting `greenlit_by_user_id` audit column records the
// operator's identity, not the agent's.
//
// Tool-use loop runs up to MAX_TOOL_ITERATIONS so a single user message can
// chain calls (e.g., "search opps in mortgage and run the critic on the top 3").

import Anthropic from "@anthropic-ai/sdk";
import { eq, desc, and, gte, like, or, sql } from "drizzle-orm";
import { getDb, opportunities as oppTable, reflections as reflTable, type OpportunityRow } from "@autoresearcher/db";
import { loadSkills, loadLatestBank } from "@autoresearcher/learn";
import { runScout } from "./scout.js";
import { reviewOpportunity } from "./critic.js";
import { recentReflections } from "../lib/reflections.js";
import { costCents } from "../lib/llm.js";
import { issueMagicLink } from "../lib/auth.js";

const MODEL = "claude-opus-4-7";
const MAX_TOOL_ITERATIONS = 6;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "query_opportunities",
    description:
      "Search opportunities by status, vertical, or min score. Returns up to 25 rows.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["inbox", "reviewing", "greenlit", "rejected", "stale"] },
        verticalSlug: { type: "string" },
        minScore: { type: "number", description: "0-50 scale" },
      },
    },
  },
  {
    name: "get_opportunity",
    description: "Fetch full detail for one opportunity by id.",
    input_schema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "review_opportunity",
    description:
      "Run CRITIC on an opportunity. Persists verdict + notes. Costs LLM tokens; only call when the operator asks for a review.",
    input_schema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "run_scout_now",
    description:
      "Run SCOUT once across all allowlisted verticals. Costs LLM tokens. Only call when the operator explicitly asks.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_skills",
    description: "List the active research skills (Voyager-style library).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_prompt_bank",
    description:
      "Return the latest distilled prompt bank — operator decisions distilled into few-shot examples.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_reflections",
    description: "Recent SCOUT/CRITIC reflections (Reflexion-style memory).",
    input_schema: {
      type: "object",
      properties: {
        agent: { type: "string", enum: ["scout", "critic", "historian"] },
        verticalSlug: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "mint_greenlight_link",
    description:
      "Mint a one-tap magic link the OPERATOR can click to greenlight an opportunity. " +
      "The link is bound to the operator's user_id (from their JWT) — clicking it sets " +
      "greenlit_by_user_id to THEIR id, not the agent's. Returns { url } the agent can " +
      "share back in chat. Does NOT greenlight by itself.",
    input_schema: {
      type: "object",
      required: ["opportunityId"],
      properties: {
        opportunityId: { type: "string" },
        action: { type: "string", enum: ["greenlight", "reject"], description: "default greenlight" },
      },
    },
  },
  {
    name: "search_text",
    description:
      "Lightweight RAG over the autoresearcher's structured store. Substring search across " +
      "opportunity titles, theses, evidence excerpts, reflections bodies, and skill bodies. " +
      "Use to ground answers when the operator asks about themes, vendors, named regulations, " +
      "or to recall past decisions. NOT a web search.",
    input_schema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "case-insensitive substring; multi-word treated as AND" },
        sources: {
          type: "array",
          items: { type: "string", enum: ["opportunities", "reflections", "skills"] },
          description: "default = all three",
        },
        limit: { type: "number", description: "max rows per source, default 8, hard max 25" },
      },
    },
  },
  {
    name: "summarize_inbox",
    description:
      "Quick snapshot for context-loading. Returns inbox count + top 5 highest-score inbox " +
      "opportunities + count by vertical + last 3 critic verdicts (verdict, vertical, title). " +
      "Cheap (DB-only). Useful at the start of a conversation to ground the agent.",
    input_schema: { type: "object", properties: {} },
  },
];

const CHAT_SYSTEM = `You are the autoresearcher operator console.

You have read access to opportunities, skills, reflections, and the prompt
bank. You have write access only to the CRITIC review action and the SCOUT
nightly trigger. You may NOT greenlight or reject opportunities directly —
to confirm a decision you mint a magic link with mint_greenlight_link and
return the URL to the operator. The operator's click is what records the
decision; the audit column logs THEIR user_id.

Be terse. Quote evidence URLs when discussing opportunities. When an action
costs LLM tokens (run_scout_now, review_opportunity), confirm with the
operator before calling unless they explicitly asked.

If a request is outside your tool surface (deploy, build code, edit files,
modify the verticals allowlist), say so and explain how the operator
performs that action themselves (PR, ADR, etc.).`;

export type ChatStep =
  | { kind: "text"; text: string }
  | { kind: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { kind: "tool_result"; toolUseId: string; output: unknown }
  | { kind: "done"; inputTokens: number; outputTokens: number; costCents: string };

export type ChatTurnArgs = {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  // Operator's verified user_id from the route's requireOperator middleware.
  // Threaded into mint_greenlight_link so the magic link binds to the
  // operator's identity, not the agent's.
  operatorUserId: string;
};

const makeClient = (): Anthropic => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  return new Anthropic({ apiKey });
};

// Streaming chat turn. Emits ChatStep events for the route to forward as SSE.
// Resolves once the loop terminates (assistant has no more tool calls).
export async function* runChatTurn(args: ChatTurnArgs): AsyncGenerator<ChatStep, void, unknown> {
  const client = makeClient();

  type AnthropicMsg = { role: "user" | "assistant"; content: string | Anthropic.MessageParam["content"] };
  const messages: AnthropicMsg[] = [
    ...args.history.map((h): AnthropicMsg => ({ role: h.role, content: h.content })),
    { role: "user", content: args.userMessage },
  ];

  let totalIn = 0;
  let totalOut = 0;
  let totalCost = 0n;

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: CHAT_SYSTEM,
      tools: TOOLS,
      messages: messages as Anthropic.MessageParam[],
    });
    totalIn += resp.usage.input_tokens;
    totalOut += resp.usage.output_tokens;
    totalCost += costCents(MODEL, resp.usage.input_tokens, resp.usage.output_tokens);

    const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    for (const block of resp.content) {
      if (block.type === "text") {
        yield { kind: "text", text: block.text };
      } else if (block.type === "tool_use") {
        const input = (block.input ?? {}) as Record<string, unknown>;
        toolCalls.push({ id: block.id, name: block.name, input });
        yield { kind: "tool_use", id: block.id, name: block.name, input };
      }
    }

    // Append the assistant message verbatim (with all blocks) to history.
    messages.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason !== "tool_use" || toolCalls.length === 0) {
      yield { kind: "done", inputTokens: totalIn, outputTokens: totalOut, costCents: totalCost.toString() };
      return;
    }

    // Execute tool calls and feed results back.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tc of toolCalls) {
      try {
        const output = await dispatchTool(tc.name, tc.input, { operatorUserId: args.operatorUserId });
        yield { kind: "tool_result", toolUseId: tc.id, output };
        results.push({
          type: "tool_result",
          tool_use_id: tc.id,
          content: JSON.stringify(output, replacer).slice(0, 8000),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        yield { kind: "tool_result", toolUseId: tc.id, output: { error: msg } };
        results.push({
          type: "tool_result",
          tool_use_id: tc.id,
          content: JSON.stringify({ error: msg }),
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  yield { kind: "done", inputTokens: totalIn, outputTokens: totalOut, costCents: totalCost.toString() };
}

// JSON.stringify replacer that converts BigInt to string and dates to ISO.
const replacer = (_k: string, v: unknown): unknown => {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  return v;
};

const dispatchTool = async (
  name: string,
  input: Record<string, unknown>,
  ctx: { operatorUserId: string }
): Promise<unknown> => {
  switch (name) {
    case "query_opportunities": {
      const status = input["status"] as string | undefined;
      const verticalSlug = input["verticalSlug"] as string | undefined;
      const minScore = input["minScore"] as number | undefined;
      const conds = [];
      if (status) conds.push(eq(oppTable.status, status as OpportunityRow["status"]));
      if (verticalSlug) conds.push(eq(oppTable.verticalSlug, verticalSlug));
      if (typeof minScore === "number") conds.push(gte(oppTable.scoreTotal, Math.round(minScore * 10)));
      const where = conds.length === 0 ? undefined : and(...conds);
      const rows = await getDb()
        .select({
          id: oppTable.id, verticalSlug: oppTable.verticalSlug, title: oppTable.title,
          scoreTotal: oppTable.scoreTotal, status: oppTable.status,
          recommendedAction: oppTable.recommendedAction, criticVerdict: oppTable.criticVerdict,
        })
        .from(oppTable)
        .where(where)
        .orderBy(desc(oppTable.scoreTotal))
        .limit(25);
      return rows.map((r) => ({ ...r, scoreTotal: r.scoreTotal / 10 }));
    }
    case "get_opportunity": {
      const id = String(input["id"] ?? "");
      const row = await getDb().query.opportunities.findFirst({ where: eq(oppTable.id, id) });
      return row ?? { error: "not found" };
    }
    case "review_opportunity": {
      const id = String(input["id"] ?? "");
      return await reviewOpportunity(id);
    }
    case "run_scout_now": {
      return await runScout({ phase: "ad-hoc" });
    }
    case "list_skills": {
      return loadSkills().map(({ id, when, verticals, priority }) => ({ id, when, verticals, priority }));
    }
    case "get_prompt_bank": {
      try {
        const bank = loadLatestBank();
        return { version: bank.version, exampleCount: bank.examples.length, metrics: bank.metrics };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
    case "list_reflections": {
      const agent = (input["agent"] as "scout" | "critic" | "historian") ?? "scout";
      const verticalSlug = input["verticalSlug"] as string | undefined;
      const limit = Math.min(50, Number(input["limit"] ?? 10));
      const rows = await recentReflections({ agent, verticalSlug, limit });
      return rows;
    }
    case "mint_greenlight_link": {
      const opportunityId = String(input["opportunityId"] ?? "");
      const action = input["action"] === "reject" ? "reject" : "greenlight";
      if (!opportunityId) return { error: "opportunityId required" };
      // The link binds to the operator's verified user_id (from their JWT,
      // threaded in via ctx). When the operator clicks the link, the magic
      // route consumes it and writes greenlit_by_user_id = ctx.operatorUserId.
      // The agent NEVER appears in the audit trail for the decision itself.
      const m = await issueMagicLink({
        purpose: action,
        subjectId: opportunityId,
        userId: ctx.operatorUserId,
      });
      return { url: m.url, action, opportunityId, ttlSeconds: Number(process.env.MAGIC_LINK_TTL_SECONDS ?? 900) };
    }
    case "search_text": {
      return await searchText({
        query: String(input["query"] ?? "").trim(),
        sources: Array.isArray(input["sources"])
          ? (input["sources"] as string[]).filter((s): s is "opportunities" | "reflections" | "skills" =>
              s === "opportunities" || s === "reflections" || s === "skills"
            )
          : ["opportunities", "reflections", "skills"],
        limit: Math.max(1, Math.min(25, Number(input["limit"] ?? 8))),
      });
    }
    case "summarize_inbox": {
      return await summarizeInbox();
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
};

// --- RAG-light: substring search over the structured store ---
const escapeLike = (s: string): string => s.replace(/[\\%_]/g, "\\$&");

type SearchHit = { source: string; id: string; title: string; snippet: string; score: number };

const searchText = async (args: {
  query: string;
  sources: Array<"opportunities" | "reflections" | "skills">;
  limit: number;
}): Promise<{ hits: SearchHit[]; query: string; sources: string[] }> => {
  if (!args.query) return { hits: [], query: args.query, sources: args.sources };
  const terms = args.query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 8);
  if (terms.length === 0) return { hits: [], query: args.query, sources: args.sources };

  const hits: SearchHit[] = [];
  const db = getDb();

  if (args.sources.includes("opportunities")) {
    // AND of LIKE conditions across title|thesis|evidence-as-text
    const oppConds = terms.map((t) => {
      const p = `%${escapeLike(t)}%`;
      return or(
        sql`LOWER(${oppTable.title}) LIKE ${p}`,
        sql`LOWER(${oppTable.thesis}) LIKE ${p}`,
        sql`LOWER(CAST(${oppTable.evidence} AS CHAR)) LIKE ${p}`
      );
    });
    const where = oppConds.length === 1 ? oppConds[0] : and(...(oppConds.filter(Boolean) as Parameters<typeof and>));
    const rows = await db
      .select({
        id: oppTable.id,
        title: oppTable.title,
        thesis: oppTable.thesis,
        verticalSlug: oppTable.verticalSlug,
        scoreTotal: oppTable.scoreTotal,
        status: oppTable.status,
      })
      .from(oppTable)
      .where(where)
      .orderBy(desc(oppTable.scoreTotal))
      .limit(args.limit);
    for (const r of rows) {
      hits.push({
        source: "opportunity",
        id: r.id,
        title: `[${r.verticalSlug}] ${r.title}`,
        snippet: snippetAround(r.thesis, terms),
        score: r.scoreTotal / 10,
      });
    }
  }

  if (args.sources.includes("reflections")) {
    const refConds = terms.map((t) => {
      const p = `%${escapeLike(t)}%`;
      return sql`LOWER(${reflTable.body}) LIKE ${p}`;
    });
    const where = refConds.length === 1 ? refConds[0] : and(...(refConds.filter(Boolean) as Parameters<typeof and>));
    const rows = await db
      .select({
        id: reflTable.id,
        body: reflTable.body,
        agent: reflTable.agent,
        verticalSlug: reflTable.verticalSlug,
        createdAt: reflTable.createdAt,
      })
      .from(reflTable)
      .where(where)
      .orderBy(desc(reflTable.createdAt))
      .limit(args.limit);
    for (const r of rows) {
      hits.push({
        source: "reflection",
        id: r.id,
        title: `[${r.agent}/${r.verticalSlug ?? "general"}] reflection`,
        snippet: snippetAround(r.body, terms),
        score: 0,
      });
    }
  }

  if (args.sources.includes("skills")) {
    const lc = args.query.toLowerCase();
    const skills = loadSkills().filter(
      (s) =>
        terms.every(
          (t) =>
            s.id.toLowerCase().includes(t) ||
            s.when.toLowerCase().includes(t) ||
            s.body.toLowerCase().includes(t)
        ) ||
        s.id.toLowerCase().includes(lc) ||
        s.when.toLowerCase().includes(lc) ||
        s.body.toLowerCase().includes(lc)
    );
    for (const s of skills.slice(0, args.limit)) {
      hits.push({
        source: "skill",
        id: s.id,
        title: `skill: ${s.id}`,
        snippet: snippetAround(`${s.when} — ${s.body}`, terms),
        score: s.priority,
      });
    }
  }

  return { hits, query: args.query, sources: args.sources };
};

const snippetAround = (text: string, terms: string[]): string => {
  const lower = text.toLowerCase();
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0) {
      const start = Math.max(0, i - 60);
      const end = Math.min(text.length, i + t.length + 120);
      const prefix = start > 0 ? "…" : "";
      const suffix = end < text.length ? "…" : "";
      return `${prefix}${text.slice(start, end).replace(/\s+/g, " ")}${suffix}`;
    }
  }
  return text.slice(0, 200);
};

const summarizeInbox = async (): Promise<{
  inboxCount: number;
  top: Array<{ id: string; title: string; verticalSlug: string; scoreTotal: number; recommendedAction: string }>;
  byVertical: Array<{ verticalSlug: string; count: number }>;
  recentVerdicts: Array<{ verdict: string; verticalSlug: string; title: string }>;
}> => {
  const db = getDb();
  const inbox = await db
    .select({
      id: oppTable.id,
      title: oppTable.title,
      verticalSlug: oppTable.verticalSlug,
      scoreTotal: oppTable.scoreTotal,
      recommendedAction: oppTable.recommendedAction,
    })
    .from(oppTable)
    .where(eq(oppTable.status, "inbox"))
    .orderBy(desc(oppTable.scoreTotal));

  const top = inbox.slice(0, 5).map((r) => ({
    id: r.id,
    title: r.title,
    verticalSlug: r.verticalSlug,
    scoreTotal: r.scoreTotal / 10,
    recommendedAction: r.recommendedAction,
  }));

  const verticalCounts = new Map<string, number>();
  for (const r of inbox) verticalCounts.set(r.verticalSlug, (verticalCounts.get(r.verticalSlug) ?? 0) + 1);
  const byVertical = [...verticalCounts.entries()]
    .map(([verticalSlug, count]) => ({ verticalSlug, count }))
    .sort((a, b) => b.count - a.count);

  const recentReviewed = await db
    .select({
      verdict: oppTable.criticVerdict,
      verticalSlug: oppTable.verticalSlug,
      title: oppTable.title,
    })
    .from(oppTable)
    .where(sql`${oppTable.criticVerdict} IS NOT NULL`)
    .orderBy(desc(oppTable.updatedAt))
    .limit(3);

  return {
    inboxCount: inbox.length,
    top,
    byVertical,
    recentVerdicts: recentReviewed.map((r) => ({
      verdict: r.verdict ?? "—",
      verticalSlug: r.verticalSlug,
      title: r.title,
    })),
  };
};
