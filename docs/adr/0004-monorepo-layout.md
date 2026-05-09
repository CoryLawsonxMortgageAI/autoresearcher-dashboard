# ADR 0004 — Monorepo layout

Status: Adopted

## Layout

```
/
├── apps/
│   └── web/                  Next.js dashboard (Vercel)
├── services/
│   ├── api/                  Hono API + agents + cron (Vercel + worker)
│   └── worker/               Dockerfile + fly.toml for the cron worker
├── packages/
│   ├── shared/               Zod-validated types, Money helpers (source-only)
│   ├── db/                   Drizzle schema + migrations + getDb() (source-only)
│   ├── skills/
│   │   └── autoresearcher/   verticals.json + scorer + prompts (source-only)
│   ├── evals/                Tier A/B/C runner + fixtures
│   └── tsconfig/             Shared TS base config
├── scripts/
│   ├── bootstrap.sh          `pnpm bootstrap` entrypoint
│   ├── sync-secrets.ts       Pull Vercel env -> .env.runtime (strips AUTOMERGE_*)
│   ├── seed-fixtures.ts      Idempotent operator-user seed
│   └── hooks/                .claude/hooks.json implementations
├── docs/
│   ├── adr/                  Architecture decisions (this file)
│   └── runs/                 HISTORIAN write-ups + _inflight.md
├── .claude/hooks.json        PreToolUse / PostToolUse policy gates
├── .github/workflows/        ci.yml, deploy.yml, revert.yml, auto-merge-tier1.yml (Tier-3)
├── backend/                  LEGACY: GPU monitoring FastAPI (kept; see ADR 0008)
├── railway*.{json,toml,py}   LEGACY: Railway config for the legacy backend
└── render.yaml               LEGACY: Render config for the legacy backend
```

## Why source-only packages?

`@autoresearcher/shared`, `@autoresearcher/db`, and `@autoresearcher/skill`
publish their `src/` directly via `main`/`exports` rather than a built
`dist/`. Reasons:
- Faster iteration: no rebuild step between editing a Zod schema and seeing
  it in `apps/web`.
- Karpathy-style minimalism: the build IS `tsc --noEmit` for typecheck and
  the consumer's bundler for shipping.
- Tree-shakable by the consumer (Next.js, esbuild, tsx).

The cost: every consumer must support TS source resolution. Both Next.js
and tsx do. CI's typecheck catches anything that wouldn't bundle.

## Why services/api and not apps/api?

Per directive: "Vercel deploy of `/apps/web` and `/services/api`". Naming
is operator-mandated; we follow it.

## Why backend/ stays where it is

The legacy backend/ predates this build. It's a working FastAPI GPU dashboard
deployed to Railway. Removing it would break that deploy. Moving it would
create a noisy diff. ADR 0008 covers its eventual disposition.
