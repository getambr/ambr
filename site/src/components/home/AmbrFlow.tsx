'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

const PATHS = [
  'M130,215 C285,215 330,295 470,295',
  'M470,295 C620,295 640,110 785,110',
  'M785,110 C935,110 950,295 1095,295',
  'M1095,295 C1230,295 1195,215 1320,215',
];
const AMBIENT = [
  'M40,70 C360,45 720,180 1080,115 C1240,85 1360,72 1400,70',
  'M40,330 C300,355 640,250 980,320 C1180,355 1340,340 1400,330',
];
const NODES = [
  { x: 130, y: 215, label: 'AGENT' },
  { x: 470, y: 295, label: 'AUTHORIZE' },
  { x: 785, y: 110, label: 'SIGN · HASH' },
  { x: 1095, y: 295, label: 'BASE L2 · cNFT' },
  { x: 1320, y: 215, label: 'VERIFY' },
];

const monoText = {
  fontFamily: 'var(--font-jetbrains-mono), monospace',
  fontSize: 14,
  letterSpacing: '0.18em',
  fill: '#c6a87c',
  fillOpacity: 0.9,
} as const;

/** The lifecycle of a mandate — paths draw themselves in on scroll (GSAP), then dashes flow. */
export default function AmbrFlow({ className = '' }: { className?: string }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draws = Array.from(el.querySelectorAll<SVGPathElement>('.af-draw'));
    const nodes = Array.from(el.querySelectorAll('.af-node'));
    const flows = Array.from(el.querySelectorAll('.af-flow'));

    draws.forEach((p) => {
      const len = p.getTotalLength();
      gsap.set(p, { strokeDasharray: len, strokeDashoffset: reduced ? 0 : len });
    });
    if (reduced) {
      gsap.set(nodes, { opacity: 1 });
      gsap.set(flows, { opacity: 0.9 });
      return;
    }
    gsap.set(nodes, { opacity: 0 });
    gsap.set(flows, { opacity: 0 });

    const tl = gsap.timeline({ paused: true });
    tl.to(draws, { strokeDashoffset: 0, duration: 1.2, stagger: 0.18, ease: 'power2.inOut' })
      .to(nodes, { opacity: 1, duration: 0.5, stagger: 0.1, ease: 'power2.out' }, '-=0.7')
      .to(flows, { opacity: 0.9, duration: 0.6, ease: 'power1.out' }, '-=0.3');

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) { tl.play(); io.disconnect(); }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      tl.kill();
    };
  }, []);

  return (
    <div ref={root} className={className} aria-hidden="true">
      <style>{`
        @keyframes ambrFlow { to { stroke-dashoffset: -240; } }
        @keyframes ambrDrift { to { stroke-dashoffset: -420; } }
        @keyframes ambrPulse { 0%,100% { opacity: .4; transform: scale(1); } 50% { opacity: .85; transform: scale(1.16); } }
        .af-flow { stroke-dasharray: 3 14; animation: ambrFlow 5s linear infinite; }
        .af-drift { stroke-dasharray: 2 24; animation: ambrDrift 16s linear infinite; }
        .af-pulse { transform-box: fill-box; transform-origin: center; animation: ambrPulse 3.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .af-flow, .af-drift, .af-pulse { animation: none; } }
      `}</style>
      <svg viewBox="0 0 1440 360" preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style={{ display: 'block' }}>
        {AMBIENT.map((d, i) => (
          <path key={'a' + i} d={d} fill="none" stroke="#9a7d52" strokeOpacity="0.45" strokeWidth="1" className="af-drift" style={{ animationDelay: `${i * -5}s` }} />
        ))}
        {PATHS.map((d, i) => (
          <path key={'b' + i} d={d} fill="none" stroke="#c6a87c" strokeOpacity="0.14" strokeWidth="1" />
        ))}
        {PATHS.map((d, i) => (
          <path key={'d' + i} d={d} fill="none" stroke="#c6a87c" strokeOpacity="0.5" strokeWidth="1.3" className="af-draw" />
        ))}
        {PATHS.map((d, i) => (
          <path key={'f' + i} d={d} fill="none" stroke="#e8d9bb" strokeWidth="1.8" className="af-flow" style={{ animationDelay: `${i * -1.25}s`, opacity: 0 }} />
        ))}
        {NODES.map((n, i) => (
          <g key={i} className="af-node">
            <circle cx={n.x} cy={n.y} r="18" fill="none" stroke="#c6a87c" strokeOpacity="0.4" strokeWidth="1" className="af-pulse" style={{ animationDelay: `${i * 0.5}s` }} />
            <circle cx={n.x} cy={n.y} r="6" fill="#0a0a0a" stroke="#e8d9bb" strokeWidth="1.7" />
            <text x={n.x} y={n.y - 36} textAnchor="middle" style={monoText}>{n.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
