'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import gsap from 'gsap';
import BrassCursor from '@/components/ui/BrassCursor';
import MagneticButton from '@/components/ui/MagneticButton';

const MandateSeal3D = dynamic(() => import('@/components/home/MandateSeal3D'), { ssr: false });

const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

export default function HeroAwwwards() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [show3D, setShow3D] = useState(false);

  // gate the WebGL seal to desktop + motion-on (lazy-loaded, never blocks first paint)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow3D(
      window.matchMedia('(min-width: 1025px)').matches &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  }, []);

  // cursor-driven 3D tilt on the code/mandate card (desktop only)
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (!window.matchMedia('(min-width: 1025px)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rotX = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3' });
    const rotY = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3' });
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      rotY(((e.clientX - (r.left + r.width / 2)) / r.width) * 10);
      rotX((-(e.clientY - (r.top + r.height / 2)) / r.height) * 10);
    };
    const onLeave = () => {
      rotX(0);
      rotY(0);
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <section className="relative flex min-h-[92vh] items-center overflow-hidden">
      <style>{`
        @keyframes ambrShimmer { 0% { background-position: 220% 0; } 100% { background-position: 0% 0; } }
        @keyframes ambrMarquee { to { transform: translateX(-50%); } }
        @keyframes ambrReveal { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
        .ambr-shimmer { background: linear-gradient(110deg,#9a7d52 0%,#e8d9bb 28%,#c6a87c 50%,#e8d9bb 72%,#9a7d52 100%); background-size: 220% 100%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; animation: ambrShimmer 2.4s ease-out forwards; }
        .ambr-marquee { animation: ambrMarquee 32s linear infinite; }
        .ambr-glow { background: radial-gradient(55% 50% at 62% 38%, rgba(198,168,124,0.13), transparent 70%); }
        .ambr-reveal { opacity: 0; animation: ambrReveal 0.75s cubic-bezier(0.22,1,0.36,1) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .ambr-shimmer { animation: none; background-position: 0 0; }
          .ambr-marquee { animation: none; }
          .ambr-reveal { opacity: 1; animation: none; }
        }
      `}</style>

      <div className="grid-bg grid-bg-dark absolute inset-0" aria-hidden="true" />
      <div className="ambr-glow absolute inset-0" aria-hidden="true" />
      {show3D && (
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: 1 }} aria-hidden="true">
          <MandateSeal3D />
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
        style={{ background: 'linear-gradient(to bottom, transparent, #0a0a0a)', zIndex: 2 }}
        aria-hidden="true"
      />

      <BrassCursor />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <div className="ambr-reveal mb-7 inline-flex items-center gap-2 border border-amber/40 bg-background/50 px-3 py-1.5" style={{ animationDelay: '0.05s' }}>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.5)' }} />
              <span className="text-micro text-white">Live on Base mainnet</span>
            </div>

            <h1
              className="ambr-shimmer leading-[0.92]"
              style={{ fontFamily: 'var(--font-instrument-serif), serif', fontSize: 'clamp(2.75rem, 5.6vw, 5.5rem)', letterSpacing: '-0.02em' }}
            >
              Your AI is about<br />to spend money.
            </h1>

            <p className="ambr-reveal mt-7 max-w-xl text-lg font-light leading-relaxed" style={{ color: '#aaa', animationDelay: '0.14s' }}>
              Ambr is the accountability record for autonomous agents. It issues{' '}
              <span className="text-text-primary">Agent Mandates</span> — binding authorizations that set
              spend limits and approved actions, with a cryptographic record of every decision.
            </p>

            <div className="ambr-reveal mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center" style={{ animationDelay: '0.22s' }}>
              <MagneticButton href="/activate">Get an API key</MagneticButton>
              <MagneticButton href="/developers" variant="secondary">See how it works</MagneticButton>
            </div>

            <div className="ambr-reveal mt-9 flex items-center gap-2 text-xs" style={{ color: '#9a9a9a', animationDelay: '0.3s' }}>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.5)' }} />
              <span style={mono}>Live on Base L2</span>
            </div>
          </div>

          <div className="ambr-reveal" style={{ perspective: 900, animationDelay: '0.18s' }}>
            <div
              ref={cardRef}
              data-cursor
              className="border border-amber/30 bg-surface transition-colors duration-300 hover:border-amber/60"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <div className="flex items-center justify-between border-b border-amber/20 px-4 py-2.5">
                <span className="text-micro" style={{ color: 'var(--color-amber)' }}>{'// three lines of code'}</span>
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2 w-2 rounded-full" style={{ background: '#2E2E2E' }} />
                  <span className="h-2 w-2 rounded-full" style={{ background: '#2E2E2E' }} />
                  <span className="h-2 w-2 rounded-full" style={{ background: 'var(--color-amber)' }} />
                </div>
              </div>
              <div className="overflow-x-auto p-5 text-[13px] leading-[1.8]" style={{ ...mono, color: '#cfcabd' }}>
                <div><span style={{ color: '#8a8577' }}>import</span> {'{ Ambr }'} <span style={{ color: '#8a8577' }}>from</span> <span style={{ color: '#c6a87c' }}>&apos;@ambr/sdk&apos;</span></div>
                <div><span style={{ color: '#8a8577' }}>const</span> ambr = <span style={{ color: '#8a8577' }}>new</span> <span style={{ color: '#e8d9bb' }}>Ambr</span>(AMBR_KEY)</div>
                <div className="mt-3"><span style={{ color: '#8a8577' }}>const</span> mandate = <span style={{ color: '#8a8577' }}>await</span> ambr.<span style={{ color: '#e8d9bb' }}>authorize</span>({'{'}</div>
                <div className="pl-5">agent, limit: <span style={{ color: '#c6a87c' }}>&apos;500 USDC&apos;</span>, expires: <span style={{ color: '#c6a87c' }}>&apos;24h&apos;</span></div>
                <div>{'}'}) <span style={{ color: '#34D399' }}>{'// → signed · on-chain · verifiable'}</span></div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border border-amber/30 bg-surface px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.5)' }} />
                <span className="text-micro" style={{ color: 'var(--color-amber)' }}>Agent Mandate · Active</span>
              </div>
              <span className="text-[11px]" style={{ ...mono, color: '#777' }}>≤ $500 USDC · 24h · revocable</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
