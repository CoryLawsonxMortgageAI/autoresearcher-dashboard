# phase-5 — apps/web

Author: HISTORIAN (compressed inline)
Date: 2026-05-09

## What landed

Next.js 14 App Router under `apps/web`. Karpathy-aesthetic globals.css:
- Background `#0a0a0a`, foreground `#e8e8e8`, accent `#7afac0` (the
  cool-mint green that reads well on dark and matches nanoGPT log
  highlights).
- JetBrains Mono / IBM Plex Mono / SF Mono / Menlo monospace stack.
- ~250 lines total. No Tailwind. No CSS-in-JS. No icon library.
- Sidebar nav with `/activity` `/opportunities` `/merges` `/evals`
  paths surfaced as `/activity` etc. — i.e., the URL is the label.

Pages:
- `/activity` — server-rendered event feed with relative timestamps.
- `/opportunities` — sortable inbox with status filters; rows link to
  detail page.
- `/opportunities/[id]` — full evidence panel, score breakdown
  (5 axes + total), critic verdict, ops metadata.
- `/merges` — per-PR card with cascade/critic/cost/revert window;
  buttons for "open in github", "tap merge" (Tier-1/2 only),
  "[Revert]" within 24h. Tier-3 cards never show "tap merge"; only
  GitHub link.
- `/evals` — latest run per tier with score, status, finished_at.
- `/magic` — consumes magic-link tokens client-side; calls
  `/proxy/api/magic/consume`.

Live updates:
- `<PusherToast />` in the root layout subscribes to all four
  channels (`activity`, `opportunities`, `merges`, `blockers`) and
  pops a toast on every event. Toasts auto-dismiss after 7s.

## What's next

Phase 6: ship.
