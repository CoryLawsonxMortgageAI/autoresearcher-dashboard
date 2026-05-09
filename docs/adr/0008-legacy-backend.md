# ADR 0008 — Disposition of the legacy `backend/` (GPU monitoring dashboard)

Status: Adopted (defer)

## Context

Before the autoresearcher buildout, this repository was a Palantir-styled
FastAPI GPU monitoring dashboard for autonomous training experiments
(`backend/main.py`, `backend/cloud_gpu.py`, `backend/agents/swarm.py`,
`backend/app/services/runpod*.py`). It was deployed to Railway via
`railway.json` / `railway.toml` / `railway_entrypoint.py`. About 2,162 LOC.

The autoresearcher buildout adds an entirely separate stack (`apps/web` +
`services/api` + Drizzle + Pusher + Anthropic) that does not depend on
`backend/` and does not share a database with it.

## Decision

Keep `backend/` in-tree, untouched, for v1.0. It continues to run on
Railway via the existing config. Document its existence here. Do not block
the autoresearcher launch on disentangling it.

## Why defer

- Removing `backend/` requires ensuring nothing in production still calls
  it. The agent doesn't have visibility into Railway runtime to confirm.
- Moving it under `services/gpu-monitor/` is a noisy diff that adds nothing
  this session.
- The two systems are independent; coexistence is fine.

## Future actions (not now)

When the operator confirms `backend/` is no longer in use:
1. `git mv backend services/gpu-monitor`
2. Update `railway*` files to point at the new path.
3. Or delete it outright if the GPU dashboard has been retired.

Either action is a Tier-3 change (touches `railway*` deploy config) and
goes through the merge policy in ADR 0006.
