import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Instrument_Serif } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { BRAND } from '@/lib/brand';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://ambr.run'),
  title: 'Ambr — Agent Mandate & Binding Registry | The liability record for autonomous agents',
  description:
    'Ambr is the authorization and liability record for autonomous agents. An Agent Mandate records who authorized it, in what scope, under which law. Readable as prose, executable as code, revocable on record.',
  alternates: {
    canonical: 'https://ambr.run',
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'Ambr — Agent Mandate & Binding Registry',
    description:
      'The liability record for autonomous agents. Who authorized it, in what scope, under which law. Revocable on record.',
    url: 'https://ambr.run',
    siteName: 'Ambr',
    type: 'website',
    images: [
      {
        url: 'https://ambr.run/api/og?title=Agent+Mandate+%26+Binding+Registry&label=AMBR&description=The+liability+record+for+autonomous+agents.&domain=ambr.run',
        width: 1200,
        height: 630,
        alt: 'Ambr — Agent Mandate & Binding Registry',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@ambr_run',
    title: 'Ambr — Agent Mandate & Binding Registry',
    description:
      'The liability record for autonomous agents. Revocable on record.',
    images: [
      'https://ambr.run/api/og?title=Agent+Mandate+%26+Binding+Registry&label=AMBR&description=The+liability+record+for+autonomous+agents.&domain=ambr.run',
    ],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Ambr',
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Contract Management',
  operatingSystem: 'Web',
  description:
    'Authorization and liability record for autonomous agents. Agent Mandates record who authorized an agent, in what scope, under which law. Dual-format: human-readable legal text plus machine-parsable JSON, linked by SHA-256 hash.',
  url: 'https://ambr.run',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Free tier available. Pay-per-contract via API key credits or x402 USDC.',
  },
  provider: {
    '@type': 'Organization',
    name: 'Ambr',
    url: 'https://ambr.run',
    sameAs: [BRAND.social.twitter, BRAND.social.github],
  },
  featureList: [
    'Agent Mandate generation (dual-format Ricardian contracts)',
    'SHA-256 integrity verification',
    'A2A and MCP agent protocols',
    'Declared spending limits, revocable on record',
    'Bilateral amendments and binding registry record',
    'Verifiable contract records',
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} antialiased`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-lg focus:bg-amber focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-background">
          Skip to content
        </a>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
