import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for standalone server output
  output: "standalone",

  // Skip type checking during build — checked separately in dev
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
