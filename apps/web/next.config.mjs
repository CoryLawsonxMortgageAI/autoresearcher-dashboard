/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Repo root, so outputFileTracing can include workspace files outside apps/web.
  outputFileTracingRoot: "../..",
  experimental: {
    typedRoutes: true,
    // Pull workspace fixtures into the serverless function bundle so
    // packages/learn/fixtures/{skills,prompt-bank,coding-bench,swe-mini}
    // are readable at runtime by readdirSync/readFileSync.
    outputFileTracingIncludes: {
      "/api/[[...slug]]/route": [
        "../../packages/learn/fixtures/**/*",
        "../../packages/skills/autoresearcher/verticals.json",
      ],
    },
  },
  // Workspace TS sources are resolved as-is; Next must transpile them.
  transpilePackages: [
    "@autoresearcher/api",
    "@autoresearcher/db",
    "@autoresearcher/learn",
    "@autoresearcher/shared",
    "@autoresearcher/skill",
  ],
  // Workspace packages use ESM-style .js imports that point at .ts source
  // files (Karpathy idiom: source-only packages, no build step). Tell
  // webpack to fall through .js -> .ts/.tsx during resolution.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
  async rewrites() {
    // Local dev: route /proxy/api/* to the standalone Hono server. In
    // production the API is served by a Next.js catch-all route handler
    // under apps/web/app/api/[[...slug]]/route.ts.
    const apiBase = process.env.API_PROXY_BASE ?? "http://localhost:3001";
    return [{ source: "/proxy/api/:path*", destination: `${apiBase}/api/:path*` }];
  },
};
export default nextConfig;
