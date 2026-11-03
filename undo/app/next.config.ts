import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The court server uses Node-only crypto and the NEAR AI SDK.
  serverExternalPackages: ["@nearai/inference-sdk"],
};

export default nextConfig;
