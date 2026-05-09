import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

const getClient = (): Anthropic => {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  _client = new Anthropic({ apiKey });
  return _client;
};

// Per global guidance: default to the latest Claude. Opus 4.7 is the most capable;
// SCOUT and CRITIC need careful reasoning, HISTORIAN can use Sonnet for speed.
export const MODEL_OPUS = "claude-opus-4-7";
export const MODEL_SONNET = "claude-sonnet-4-6";
export const MODEL_HAIKU = "claude-haiku-4-5-20251001";

// Karpathy-style: one entry point, one shape, no orchestration ceremony.
// Prompt caching is on by default for the system prompt (it's stable across calls).
export const callClaude = async (args: {
  model: string;
  system: string;
  userJson: unknown;
  maxTokens?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> => {
  const client = getClient();
  const resp = await client.messages.create({
    model: args.model,
    max_tokens: args.maxTokens ?? 4096,
    system: [
      {
        type: "text",
        text: args.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: JSON.stringify(args.userJson, null, 2) }],
  });
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return {
    text,
    inputTokens: resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
  };
};

// Cost estimation in cents (bigint). Rough public-rates approximation; we
// re-derive in the cost ceiling check using actual token counts. Kept here as
// a deterministic helper so tests don't need network.
export const costCents = (model: string, inputTokens: number, outputTokens: number): bigint => {
  const rates = {
    "claude-opus-4-7":     { in: 1500, out: 7500 },     // cents per 1M tokens
    "claude-sonnet-4-6":   { in: 300,  out: 1500 },
    "claude-haiku-4-5-20251001": { in: 80, out: 400 },
  } as const satisfies Record<string, { in: number; out: number }>;
  const r = (rates as Record<string, { in: number; out: number }>)[model];
  if (!r) return 0n;
  const inCents = (BigInt(inputTokens) * BigInt(r.in)) / 1_000_000n;
  const outCents = (BigInt(outputTokens) * BigInt(r.out)) / 1_000_000n;
  return inCents + outCents;
};
