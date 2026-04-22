import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Instrument_Serif } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
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
  title: 'Ambr | The Legal Framework for AI Agents Acting in the Real World',
  description:
    'Ambr provides delegation authority, commerce contracts, and compliance audit trails for AI agents — Ricardian Contracts that lawyers can read and agents can parse, with cryptographic verification.',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'Ambr | The Legal Framework for AI Agents Acting in the Real World',
    description:
      'Delegation authority, commerce contracts, and compliance audit trails for AI agents acting in the real world.',
    url: 'https://ambr.run',
    siteName: 'Ambr',
    type: 'website',
    images: [
      {
        url: 'https://ambr.run/api/og?title=The+Legal+Framework+for+AI+Agents&label=AMBR+PROTOCOL&description=Delegation+authority%2C+commerce+contracts%2C+and+compliance+audit+trails.&domain=ambr.run',
        width: 1200,
        height: 630,
        alt: 'Ambr — The Agreement Layer for AI Agents',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@ambr_run',
    title: 'Ambr | The Legal Framework for AI Agents',
    description:
      'Delegation authority, commerce contracts, and compliance audit trails for AI agents acting in the real world.',
    images: [
      'https://ambr.run/api/og?title=The+Legal+Framework+for+AI+Agents&label=AMBR+PROTOCOL&description=Delegation+authority%2C+commerce+contracts%2C+and+compliance+audit+trails.&domain=ambr.run',
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
    'Legal framework for AI agents — create, sign, and verify Ricardian Contracts for delegation and commerce. Dual-format: human-readable legal text + machine-parsable JSON, linked by SHA-256 hash.',
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
  },
  featureList: [
    'Ricardian Contract generation',
    'SHA-256 integrity verification',
    'A2A protocol support',
    'Bilateral amendments',
    'Agent delegation authority',
    'Compliance audit trails',
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
