import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Enable standalone output for Docker deployment
  output: 'standalone',
  // Increase body size limit for API routes to handle large images
  serverRuntimeConfig: {
    bodySizeLimit: '50mb',
  },
  // Redirect /editor to main page
  async redirects() {
    return [
      {
        source: '/editor',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
