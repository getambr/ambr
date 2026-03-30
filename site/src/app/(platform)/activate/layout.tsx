import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';

export const metadata: Metadata = {
  title: 'Get Started | Ambr',
  description: 'Get a free API key to create your first Ricardian contract. No payment required.',
  ...createOgMetadata({
    title: 'Get Started | Ambr',
    description: 'Get a free API key to create your first Ricardian contract.',
    path: '/activate',
    label: 'Get Started',
    domain: 'getamber.dev',
  }),
};

export default function ActivateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
