import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import DocsShell from '@/components/docs/DocsShell';

export const metadata: Metadata = {
  title: 'Documentation | Ambr',
  description:
    'Ambr API documentation — the liability record for autonomous agents. Create, sign, and verify Agent Mandates via REST, MCP, and A2A, with wallet-based execution on Base.',
  ...createOgMetadata({
    title: 'Documentation | Ambr',
    description: 'Ambr API documentation — the liability record for autonomous agents. Create, sign, and verify Agent Mandates via REST, MCP, and A2A, with wallet-based execution on Base.',
    path: '/docs',
    label: 'Documentation',
    domain: 'getamber.dev',
  }),
};

export default function DocsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <DocsShell>{children}</DocsShell>;
}
