/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { typedRoutes: true },
  async rewrites() {
    const apiBase = process.env.API_PROXY_BASE ?? "http://localhost:3001";
    return [{ source: "/proxy/api/:path*", destination: `${apiBase}/api/:path*` }];
  },
};
export default nextConfig;
