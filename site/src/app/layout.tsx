import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Instrument_Serif } from 'next/font/google';
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
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} antialiased`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-lg focus:bg-amber focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-background">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
