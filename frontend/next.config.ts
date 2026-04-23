import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Cloud Run — produces .next/standalone/server.js
  output: "standalone",
};

export default nextConfig;
