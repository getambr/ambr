import type { Metadata } from 'next';
import HeroUnicornCombo from '@/components/home/HeroUnicornCombo';

// Review route: the hero with a full-bleed Unicorn Studio scene background. Not linked.
export const metadata: Metadata = {
  title: 'Ambr — Unicorn hero (review)',
  robots: { index: false, follow: false },
};

export default function HeroUnicornPage() {
  return (
    <main style={{ background: '#0a0a0a' }}>
      <HeroUnicornCombo />
    </main>
  );
}
