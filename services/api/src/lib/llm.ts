import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, resolveModel, supportsBetaPromptCaching, getProvider, type LogicalModel } from "./llm-client.js";

// Backwards-compat: code outside this file used to import MODEL_OPUS as a
// string literal. We now resolve at call time. These are still exported for
// callers that just want a logical handle.
export const MODEL_OPUS: LogicalModel = "opus";
export const MODEL_SONNET: LogicalModel = "sonnet";
export const MODEL_HAIKU: LogicalModel = "haiku";

export type LlmCallResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  // Concrete model id used (e.g., "claude-opus-4-7" or "anthropic/claude-opus-4-7").
  modelId: string;
};

// Karpathy-style: one entry point, one shape, no orchestration ceremony.
// Prompt caching: when the active provider supports the beta path
// (Anthropic native), we use it. On OpenRouter we issue a regular
// messages.create — the cache_control hint on the system block still
// activates Anthropic-side caching; OpenRouter just doesn't expose the
// cache hit/create token counts in the same shape, so they default to 0.
export const callClaude = async (args: {
  model: LogicalModel;
  system: string;
  userJson: unknown;
  maxTokens?: number;
}): Promise<LlmCallResult> => {
  const client = getAnthropic();
  const modelId = resolveModel(args.model);
  const useBeta = supportsBetaPromptCaching();
  const body: Anthropic.MessageCreateParamsNonStreaming = {
    model: modelId,
    max_tokens: args.maxTokens ?? 4096,
    system: [
      {
        type: "text",
        text: args.system,
        ...(useBeta ? { cache_control: { type: "ephemeral" } } : {}),
      },
    ],
    messages: [{ role: "user", content: JSON.stringify(args.userJson, null, 2) }],
  };
  // Both call sites are non-streaming, but the SDK's union type includes a
  // streaming variant. Cast to Message (non-streaming) since stream:true is
  // not set in `body`.
  type NonStreamMessage = {
    content: Array<{ type: string; text?: string }>;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  const resp = (useBeta
    ? ((await client.beta.promptCaching.messages.create(
        body as Parameters<typeof client.beta.promptCaching.messages.create>[0]
      )) as unknown as NonStreamMessage)
    : ((await client.messages.create(body)) as unknown as NonStreamMessage));
  const text = resp.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
  const usage = resp.usage;
  return {
    text,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    modelId,
  };
};

// Cost estimation in cents (bigint). Rough public-rates approximation.
// On OpenRouter the actual billed cost includes their margin; this helper
// is a per-run signal, not a billing source-of-truth (use the OpenRouter
// dashboard for that).
export const costCents = (model: LogicalModel | string, inputTokens: number, outputTokens: number): bigint => {
  // Allow callers to pass either the logical short name or the resolved id.
  const norm =
    typeof model === "string"
      ? (model.includes("opus") ? "opus" : model.includes("sonnet") ? "sonnet" : model.includes("haiku") ? "haiku" : "opus")
      : model;
  const rates: Record<LogicalModel, { in: number; out: number }> = {
    opus:   { in: 1500, out: 7500 },
    sonnet: { in: 300,  out: 1500 },
    haiku:  { in: 80,   out: 400 },
  };
  const provider = (() => { try { return getProvider(); } catch { return "anthropic" as const; } })();
  // OpenRouter typical pass-through (~5% margin); we apply a flat 5% bump for
  // non-Anthropic provider paths so estimates don't underreport.
  const markup = provider === "openrouter" ? 105n : 100n;
  const r = rates[norm as LogicalModel] ?? rates.opus;
  const inCents = (BigInt(inputTokens) * BigInt(r.in) * markup) / (1_000_000n * 100n);
  const outCents = (BigInt(outputTokens) * BigInt(r.out) * markup) / (1_000_000n * 100n);
  return inCents + outCents;
};
