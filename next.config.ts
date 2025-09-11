import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Enable standalone output for Docker deployment
  output: 'standalone',
  // Increase body size limit for API routes to handle large images
  serverRuntimeConfig: {
    bodySizeLimit: '50mb',
  },
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default nextConfig;
