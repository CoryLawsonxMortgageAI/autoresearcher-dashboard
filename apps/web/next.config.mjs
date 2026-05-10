/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { typedRoutes: true },
  // Workspace TS sources are resolved as-is; Next must transpile them.
  transpilePackages: [
    "@autoresearcher/api",
    "@autoresearcher/db",
    "@autoresearcher/learn",
    "@autoresearcher/shared",
    "@autoresearcher/skill",
  ],
  async rewrites() {
    // Local dev: route /proxy/api/* to the standalone Hono server. In
    // production the API is served by a Next.js catch-all route handler
    // under apps/web/app/api/[[...slug]]/route.ts.
    const apiBase = process.env.API_PROXY_BASE ?? "http://localhost:3001";
    return [{ source: "/proxy/api/:path*", destination: `${apiBase}/api/:path*` }];
  },
};
export default nextConfig;
