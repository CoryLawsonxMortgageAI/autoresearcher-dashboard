// Server-only API client. Resolves the API base URL in this priority order:
//   1. API_INTERNAL_BASE        — explicit override (e.g., for testing)
//   2. NEXT_PUBLIC_API_BASE_URL — explicit override surfaced to the client
//   3. VERCEL_URL              — auto-set by Vercel on every deploy
//   4. http://localhost:3001   — local dev (standalone Hono server)
//
// On Vercel the Next.js catch-all route at /api/[[...slug]] handles every
// request, so we point at our own deployment URL.
const resolveBase = (): string => {
  if (process.env.API_INTERNAL_BASE) return process.env.API_INTERNAL_BASE;
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;
  return "http://localhost:3001";
};

export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const base = resolveBase();
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`api ${path}: ${r.status} ${text}`);
  }
  return (await r.json()) as T;
};
