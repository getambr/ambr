import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@kynesyslabs/demosdk', '@cryptkeeperzk/snarkjs', 'poseidon-lite'],
  // Bundle private investor assets into the serverless functions that serve them
  outputFileTracingIncludes: {
    '/api/v1/investors/deck': ['./private-assets/investor-deck.pdf'],
    '/api/v1/investors/deck/mobile': ['./private-assets/investor-deck-mobile.pdf'],
    // The tokenised share link serves the same file with no gate — see the
    // header comment in src/app/m/[token]/route.ts for why it is a token and
    // not simply public.
    '/m/[token]': [
      './private-assets/investor-deck-mobile.pdf',
    ],
    '/api/v1/investors/model': ['./private-assets/investor-model.xlsx'],
    '/api/v1/investors/slide/[n]': ['./private-assets/investor-slides/**'],
    '/api/v1/investors/onepager': ['./private-assets/investor-brief.pdf'],
    // The two ungated documents. Same bundling requirement as the gated ones —
    // they live in private-assets to stay out of git, not to stay out of reach.
    '/what-it-is': ['./private-assets/ambr-what-it-is.pdf'],
    '/portfolio': ['./private-assets/ilvers-portfolio.pdf'],
    '/investors': ['./private-data/**'],
    // The brief page reads figures from private-data at request time, same as
    // /investors — without this it renders with the redacted PLACEHOLDER values
    // in production and nothing looks broken.
    '/investors/brief': ['./private-data/**'],
  },
  // /brief points at the open explainer, a sibling of /what-it-is and
  // /portfolio. The gated brief is not reachable through it.
  //
  // permanent: false. A 301 is cached by browsers effectively forever and would
  // make /brief impossible to repoint later. The gated brief PDF is untouched at
  // /api/v1/investors/onepager.
  async redirects() {
    return [
      { source: '/brief', destination: '/what-it-is', permanent: false },
    ];
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
