import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@kynesyslabs/demosdk', '@cryptkeeperzk/snarkjs', 'poseidon-lite'],
  // Bundle private investor assets into the serverless functions that serve them
  outputFileTracingIncludes: {
    '/api/v1/investors/deck': ['./private-assets/investor-deck.pdf'],
    '/api/v1/investors/model': ['./private-assets/investor-model.xlsx'],
    '/api/v1/investors/slide/[n]': ['./private-assets/investor-slides/**'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
