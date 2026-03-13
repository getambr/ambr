'use client';

import dynamic from 'next/dynamic';
import { motion, useReducedMotion } from 'framer-motion';
import Button from '@/components/ui/Button';

const UnicornScene = dynamic(() => import('unicornstudio-react/next'), {
  ssr: false,
  loading: () => <div className="absolute inset-0" style={{ background: '#000000' }} />,
});

export default function HeroSection() {
  const prefersReduced = useReducedMotion();

  return (
    <>
      {/* Page-enter transition overlay */}
      <motion.div
        className="fixed inset-0 z-50 pointer-events-none"
        style={{ background: '#000000' }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        aria-hidden="true"
      />

      <section className="relative min-h-[100vh] flex items-center justify-center overflow-hidden">
        {/* Unicorn Studio WebGL background */}
        {!prefersReduced && (
          <div className="absolute inset-0 w-full h-full" aria-hidden="true">
            <UnicornScene
              projectId="F7h7aFibe1AHHTqGZQFV"
              sdkUrl="https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.0.5/dist/unicornStudio.umd.js"
              width="100%"
              height="100%"
            />
          </div>
        )}

        {/* Amber radial glow — blends WebGL with site palette */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(245,166,35,0.07) 0%, transparent 65%)',
            zIndex: 1,
          }}
        />

        {/* Bottom vignette — fades into next section */}
        <div
          className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
          aria-hidden="true"
          style={{
            background: 'linear-gradient(to bottom, transparent 0%, #000000 100%)',
            zIndex: 2,
          }}
        />

        {/* Edge vignette — keeps text readable */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background: 'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(0,0,0,0.75) 100%)',
            zIndex: 2,
          }}
        />

        {/* Hero content */}
        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <motion.div
            initial={prefersReduced ? {} : { opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
          >
            <p className="mb-4 text-sm font-mono uppercase tracking-widest text-amber">
              The Legal Framework
            </p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
              AI Agents Acting in the{' '}
              <span className="text-amber">Real World</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary leading-relaxed">
              Companies are deploying AI agents that buy, sign, and negotiate on
              their behalf. Ambr provides the delegation authority,
              commerce contracts, and compliance audit trail — Ricardian Contracts
              that lawyers can read and agents can parse, minted as cNFTs on-chain.
            </p>
          </motion.div>

          <motion.div
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={prefersReduced ? {} : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <Button href="/waitlist" size="lg">
              Join the Waitlist
            </Button>
            <Button href="/how-it-works" variant="secondary" size="lg">
              See How It Works
            </Button>
          </motion.div>
        </div>
      </section>
    </>
  );
}
