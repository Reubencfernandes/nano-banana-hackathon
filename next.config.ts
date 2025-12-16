import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Enable standalone output for Docker deployment
  output: 'standalone',
  // Increase body size limit for API routes to handle large images
  serverRuntimeConfig: {
    bodySizeLimit: '50mb',
  },
  // Expose HuggingFace OAuth environment variables to the client
  // HF injects OAUTH_CLIENT_ID when hf_oauth: true is set in README
  env: {
    NEXT_PUBLIC_OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || '',
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
