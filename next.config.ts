import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit loads Helvetica.afm from disk; bundling breaks __dirname resolution.
  serverExternalPackages: ["pdfkit"],
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
