import { headers } from 'next/headers';
import { Metadata } from 'next';
import { isInvestorAuthenticated } from '@/lib/investor-auth';
import InvestorGate from '@/components/investors/InvestorGate';
import InvestorContent from '@/components/investors/InvestorContent';

export const metadata: Metadata = {
  title: 'Investor Access | Ambr',
  description: 'Password-gated investor package for Ambr. $500K pre-seed at $15M cap.',
  robots: { index: false, follow: false },
};

// Always server-render; never cache (content varies by auth state)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InvestorsPage() {
  // Reconstruct a Request-like object for cookie extraction
  const headersList = await headers();
  const cookieHeader = headersList.get('cookie') ?? '';
  const fakeRequest = new Request('https://local/', {
    headers: { cookie: cookieHeader },
  });

  if (!isInvestorAuthenticated(fakeRequest)) {
    return <InvestorGate />;
  }
  return <InvestorContent />;
}
