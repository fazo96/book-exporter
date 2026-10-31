import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // `next dev` refuses its dev resources (live reload…) to hosts other than
  // localhost and the one it started with: list the names or addresses other
  // machines use to reach it, comma-separated (docs/development.md).
  allowedDevOrigins: (process.env.BOOKX_DEV_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  // The export reads assets/ (the Lua filter, the Typst library) at run time,
  // out of the bundler's sight: the routes that export list it.
  outputFileTracingIncludes: {
    "/api/projects/[id]/build": ["./assets/**"],
  },
};

export default nextConfig;
