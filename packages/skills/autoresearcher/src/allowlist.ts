import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { VerticalsFileSchema, type Vertical, type VerticalsFile } from "@autoresearcher/shared";

const here = dirname(fileURLToPath(import.meta.url));
const VERTICALS_PATH = resolve(here, "..", "verticals.json");

let _cache: VerticalsFile | null = null;

export const loadVerticals = (): VerticalsFile => {
  if (_cache) return _cache;
  const raw = readFileSync(VERTICALS_PATH, "utf8");
  const parsed = JSON.parse(raw);
  _cache = VerticalsFileSchema.parse(parsed);
  return _cache;
};

export const getVerticalBySlug = (slug: string): Vertical | undefined =>
  loadVerticals().verticals.find((v) => v.slug === slug);

export class OutOfAllowlistError extends Error {
  constructor(readonly slug: string) {
    super(`vertical '${slug}' is outside the allowlist`);
    this.name = "OutOfAllowlistError";
  }
}

// Tool-layer enforcement. SCOUT calls this before emitting any opportunity.
// Per directive: "Out-of-allowlist verticals rejected at SCOUT tool layer."
export const requireAllowedVertical = (slug: string): Vertical => {
  const env = process.env.VERTICAL_ALLOWLIST_OVERRIDE;
  if (env) {
    const allowed = env.split(",").map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(slug)) throw new OutOfAllowlistError(slug);
    const v = getVerticalBySlug(slug);
    if (v) return v;
  }
  const v = getVerticalBySlug(slug);
  if (!v) throw new OutOfAllowlistError(slug);
  return v;
};
