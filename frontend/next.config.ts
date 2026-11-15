import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = process.cwd();
const dependencyRoot = existsSync(resolve(appRoot, "node_modules/next/package.json"))
  ? appRoot
  : resolve(appRoot, "..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.1.*", "Merts-MacBook-Pro.local"],
  async rewrites() {
    return [
      { source: "/map-api/:path*", destination: `${process.env.MAP_API_INTERNAL_URL ?? "http://127.0.0.1:8000"}/:path*` },
      { source: "/sound-api/:path*", destination: `${process.env.SONIFY_API_INTERNAL_URL ?? "http://127.0.0.1:8001"}/:path*` },
    ];
  },
  turbopack: {
    root: dependencyRoot,
  },
};

export default nextConfig;
