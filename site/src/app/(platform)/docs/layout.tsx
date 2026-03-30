import { Metadata } from 'next';
import { createOgMetadata } from '@/lib/og/create-og-metadata';
import DocsShell from '@/components/docs/DocsShell';

export const metadata: Metadata = {
  title: 'Documentation | Ambr',
  description:
    'Ambr API documentation — Ricardian legal infrastructure for AI agents. REST API, MCP, A2A discovery, and wallet integration.',
  ...createOgMetadata({
    title: 'Documentation | Ambr',
    description: 'Ambr API documentation — Ricardian legal infrastructure for AI agents. REST API, MCP, A2A discovery, and wallet integration.',
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
