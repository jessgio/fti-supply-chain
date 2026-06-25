import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages read files from disk; bundling breaks __dirname resolution.
  serverExternalPackages: ["pdfkit", "color-books"],
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
