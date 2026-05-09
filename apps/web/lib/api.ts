// Server-only API client. We talk to services/api over HTTP. On Vercel both
// services live behind the same project; locally apps/web proxies via /proxy.
const base = process.env.API_INTERNAL_BASE ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
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
