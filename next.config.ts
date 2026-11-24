import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.ngrok-free.app"],
  async rewrites() {
    // These SDKs normalize serverUrl to its origin and append their own paths.
    return [
      { source: "/v1/remote-config/:action", destination: "/api/thinkingdata/sdk/v1/remote-config/:action" },
      { source: "/sync_js", destination: "/api/thinkingdata/sdk/sync_js" },
      { source: "/data_debug", destination: "/api/thinkingdata/sdk/data_debug" },
    ];
  },
};

export default nextConfig;
