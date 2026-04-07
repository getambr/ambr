'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Button from '@/components/ui/Button';
import HeroMotif from '@/components/home/HeroMotif';

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

      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Grid background */}
        <div className="grid-bg grid-bg-dark" />

        {/* Hero motif */}
        <HeroMotif />

        {/* Bottom vignette — fades into next section */}
        <div
          className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
          aria-hidden="true"
          style={{
            background: 'linear-gradient(to bottom, transparent 0%, #0a0a0a 100%)',
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
            {/* Badge */}
            <div className="mb-6 inline-flex items-center gap-2 border border-amber/40 rounded-full bg-background/50 backdrop-blur px-4 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.5)' }} />
              <span className="text-micro text-white">Alpha v1.0 — Free on testnet</span>
            </div>

            <h1
              className="brass-gradient-text leading-[0.95]"
              style={{ fontSize: 'clamp(3rem, 6vw, 6rem)', letterSpacing: '-0.02em' }}
            >
              Your AI is about<br />to spend money.
            </h1>
            <p className="mx-auto mt-6 max-w-[640px] text-lg leading-relaxed font-light" style={{ color: '#aaa' }}>
              Ambr is the permission layer for autonomous agents. Set spend limits,
              define what actions are authorized, and get a cryptographic record of
              every decision — in three lines of code.
            </p>
          </motion.div>

          <motion.div
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={prefersReduced ? {} : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <Button href="/activate" size="lg">
              Get an API key
            </Button>
            <Button href="/developers" variant="secondary" size="lg">
              See how it works
            </Button>
          </motion.div>
        </div>
      </section>
    </>
  );
}
