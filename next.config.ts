import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The orchestrator streams for minutes on long runs; keep the Node runtime.
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
