import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages read files from disk; bundling breaks __dirname resolution.
  serverExternalPackages: ["pdfkit", "color-books"],
  async redirects() {
    return [
      {
        source: "/dashboard/procurement/vendor-products",
        destination: "/dashboard/procurement/product-names",
        permanent: true,
      },
      {
        source: "/api/procurement/vendor-products",
        destination: "/api/procurement/product-names",
        permanent: true,
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
