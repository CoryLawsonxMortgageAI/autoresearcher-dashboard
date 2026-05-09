#!/usr/bin/env bash
# `pnpm bootstrap` — reproducible-from-fresh-checkout per directive.
# Clones .env from Vercel, runs migrations, seeds eval fixtures, starts dev
# server, opens browser to /activity. Idempotent.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== node version =="
node --version
echo "== pnpm version =="
pnpm --version

echo "== install =="
pnpm install --frozen-lockfile

if [ -f ".env" ]; then
  echo "== .env already present (skipping vercel pull) =="
else
  if command -v vercel >/dev/null 2>&1 && [ -n "${VERCEL_TOKEN:-}" ]; then
    echo "== pulling .env from vercel =="
    pnpm dlx vercel@latest env pull .env --yes --environment=development --token="$VERCEL_TOKEN"
  else
    echo "!! vercel CLI not configured; copy .env.example -> .env and fill in"
    cp .env.example .env
  fi
fi

echo "== db: generate + migrate (skipped if no DATABASE_URL) =="
if grep -q "^DATABASE_URL=." .env 2>/dev/null; then
  pnpm --filter @autoresearcher/db generate || true
  pnpm --filter @autoresearcher/db migrate
else
  echo "!! DATABASE_URL not set; skipping migrations"
fi

echo "== seed eval fixtures (no-op if already present) =="
pnpm tsx scripts/seed-fixtures.ts || true

echo "== typecheck =="
pnpm -r typecheck

echo "== start dev server (api + web) =="
pnpm dev &
DEV_PID=$!

sleep 4
URL="http://localhost:3000/activity"
if command -v open >/dev/null 2>&1; then open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
else echo "open $URL in your browser"
fi

trap "kill $DEV_PID 2>/dev/null || true" EXIT
wait $DEV_PID
