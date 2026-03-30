import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';

export const metadata: Metadata = {
  title: 'Dashboard | Ambr',
  description: 'Manage your contracts, API keys, and wallet connections from the Ambr dashboard.',
  ...createOgMetadata({
    title: 'Dashboard | Ambr',
    description: 'Manage your contracts, API keys, and wallet connections.',
    path: '/dashboard',
    label: 'Dashboard',
    domain: 'getamber.dev',
  }),
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
