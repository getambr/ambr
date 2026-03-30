import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';

export const metadata: Metadata = {
  title: 'Contract Reader | Ambr',
  description: 'Read, verify, and sign Ricardian contracts. Verify SHA-256 hashes against on-chain records.',
  ...createOgMetadata({
    title: 'Contract Reader | Ambr',
    description: 'Read, verify, and sign Ricardian contracts.',
    path: '/reader',
    label: 'Reader',
    domain: 'getamber.dev',
  }),
};

export default function ReaderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
