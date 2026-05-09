// Operator chat agent. Tool-use over the autoresearcher's existing
// surfaces: SCOUT, CRITIC, opportunity search, skills, reflections,
// HISTORIAN. Per directive, we never expose Tier-3 actions through chat —
// chat can READ everything but can WRITE only `inbox`-status changes
// (greenlight requires the operator's interactive tap on `/opportunities/:id`).
//
// Tool-use loop runs up to MAX_TOOL_ITERATIONS so a single user message can
// chain calls (e.g., "search opps in mortgage and run the critic on the top 3").

import Anthropic from "@anthropic-ai/sdk";
import { eq, desc, and, gte } from "drizzle-orm";
import { getDb, opportunities as oppTable, type OpportunityRow } from "@autoresearcher/db";
import { loadSkills, loadLatestBank } from "@autoresearcher/learn";
import { runScout } from "./scout.js";
import { reviewOpportunity } from "./critic.js";
import { recentReflections } from "../lib/reflections.js";
import { costCents } from "../lib/llm.js";

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
];

const CHAT_SYSTEM = `You are the autoresearcher operator console.

You have read access to opportunities, skills, reflections, and the prompt
bank. You have write access only to the CRITIC review action and the SCOUT
nightly trigger. You may NOT greenlight or reject opportunities directly —
that requires the operator's interactive tap on /opportunities/:id (the
audit trail records THEIR user_id, not yours).

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
        const output = await dispatchTool(tc.name, tc.input);
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

const dispatchTool = async (name: string, input: Record<string, unknown>): Promise<unknown> => {
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
    default:
      throw new Error(`unknown tool: ${name}`);
  }
};
