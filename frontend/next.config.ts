import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = process.cwd();
const dependencyRoot = existsSync(resolve(appRoot, "node_modules/next/package.json"))
  ? appRoot
  : resolve(appRoot, "..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.1.82"],
  turbopack: {
    root: dependencyRoot,
  },
};

export default nextConfig;
