// Provider abstraction. The Anthropic SDK is the only client we use,
// because OpenRouter exposes an Anthropic-compatible endpoint at
// https://openrouter.ai/api/v1 (just a different baseURL + a prefixed
// model name like "anthropic/claude-opus-4-7").
//
// Selection rules:
//   1. ANTHROPIC_API_KEY set    -> native Anthropic, model strings used as-is
//   2. OPENROUTER_API_KEY set   -> OpenRouter, model strings prefixed "anthropic/"
//   3. Neither                   -> throw at first call
//
// The provider is decided at first use, then cached.

import Anthropic from "@anthropic-ai/sdk";

export type Provider = "anthropic" | "openrouter";

let _client: Anthropic | null = null;
let _provider: Provider | null = null;

const detectProvider = (): { provider: Provider; apiKey: string; baseURL?: string } => {
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    };
  }
  throw new Error("No LLM key set. Provide ANTHROPIC_API_KEY or OPENROUTER_API_KEY.");
};

export const getAnthropic = (): Anthropic => {
  if (_client) return _client;
  const cfg = detectProvider();
  _provider = cfg.provider;
  _client = new Anthropic({
    apiKey: cfg.apiKey,
    ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
    // OpenRouter recommends these headers for attribution / app-routing.
    ...(cfg.provider === "openrouter"
      ? {
          defaultHeaders: {
            "HTTP-Referer": process.env.OPENROUTER_REFERRER ?? "https://autoresearcher-dashboard.vercel.app",
            "X-Title": "autoresearcher",
          },
        }
      : {}),
  });
  return _client;
};

export const getProvider = (): Provider => {
  if (!_provider) getAnthropic();
  return _provider!;
};

// Resolve a logical model name to the provider-specific id.
// We use short logical names internally so the rest of the code doesn't
// branch on provider.
export type LogicalModel = "opus" | "sonnet" | "haiku";

const ANTHROPIC_NATIVE: Record<LogicalModel, string> = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

const OPENROUTER: Record<LogicalModel, string> = {
  opus: "anthropic/claude-opus-4-7",
  sonnet: "anthropic/claude-sonnet-4-6",
  haiku: "anthropic/claude-haiku-4-5",
};

export const resolveModel = (logical: LogicalModel): string => {
  const provider = getProvider();
  return provider === "openrouter" ? OPENROUTER[logical] : ANTHROPIC_NATIVE[logical];
};

// Prompt caching: native Anthropic supports the beta endpoint. OpenRouter
// supports cache_control on the request but not the beta path; standard
// messages.create with cache_control inline still gets prompt caching for
// Anthropic models. So we route accordingly.
export const supportsBetaPromptCaching = (): boolean => getProvider() === "anthropic";
