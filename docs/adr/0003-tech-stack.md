# ADR 0003 — Tech stack

Status: Adopted

## Decisions

| Concern              | Choice                          | Why                                                                 |
|----------------------|---------------------------------|---------------------------------------------------------------------|
| Package manager      | pnpm 9 + workspaces             | Directive specifies `pnpm bootstrap`. pnpm is the directive's choice. |
| Runtime              | Node 20 LTS                     | Directive references TS-first (`drizzle-kit migrate`, `pnpm`).      |
| Web framework        | Next.js 14 App Router           | Vercel-native; SSR + RSC + edge support without configuration.       |
| API framework        | Hono                            | Karpathy-minimal; works on Node, edge, and Vercel serverless from the same source. |
| ORM                  | Drizzle (MySQL dialect)         | Directive: `drizzle-kit migrate`. PlanetScale-compatible.            |
| Database             | PlanetScale (MySQL/Vitess)      | Directive: "PlanetScale (or chosen MySQL)".                          |
| LLM                  | Anthropic Claude 4.7 Opus / 4.6 Sonnet | Latest Claude models per `claude-api` skill guidance. Prompt caching on the system prompt. |
| Live events          | Pusher Channels                 | Directive specifies Pusher. Events also persisted to DB so the activity feed survives Pusher outages. |
| Auth                 | jose (HS256) + magic links      | Minimal. Magic links are short-lived JWTs, hashed in DB for replay protection. |
| Email                | Resend                          | Directive specifies Resend or SendGrid; Resend has the simpler API. |
| Observability        | Sentry + OpenTelemetry          | Directive specifies both.                                           |
| Validation           | Zod                             | Single source of truth for runtime + types.                         |
| Worker host          | Fly.io OR Railway (Dockerfile)  | Directive: "Railway / Fly / Hetzner". Whichever is provisioned.     |
| Money                | bigint cents                    | Directive bans money-as-number. Hook enforces.                      |

## Non-choices (deliberate)

- **No tRPC.** Hono's typed routes plus shared Zod schemas are enough.
- **No GraphQL.** No client demand for it.
- **No ORM other than Drizzle.** Directive specifies it.
- **No Tailwind / no UI framework.** One CSS file, monospace, dark.
  Karpathy-style. Lighter, easier to read, fewer build dependencies.
- **No state library on the web.** RSC + revalidate + useEffect for live
  toasts is sufficient.
- **No ecosystem auth library (NextAuth, Clerk).** Magic links suffice for
  one-operator + digest-greenlight use case.

## Future re-evaluation triggers

If any of these become true, this ADR is up for replacement:
- Operator count exceeds 1 (need real auth: NextAuth or Clerk).
- Multi-tenant data isolation needed (need row-level security / per-tenant DB).
- Web traffic > 100 req/s (consider edge runtime for /api).
- LLM cost > $1/opportunity sustained (need a Haiku-pre-filter + Opus-only-on-borderline).
