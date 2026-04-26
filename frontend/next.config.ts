import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for standalone server output
  output: "standalone",

  // Skip type checking and ESLint during build — checked separately in dev
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
