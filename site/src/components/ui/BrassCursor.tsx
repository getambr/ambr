'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

/** Custom brass ring cursor — desktop only, scales over interactive elements. */
export default function BrassCursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const desktop = window.matchMedia('(min-width: 1025px)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!desktop || reduced) return;

    gsap.set(el, { xPercent: -50, yPercent: -50, opacity: 1 });
    const xTo = gsap.quickTo(el, 'x', { duration: 0.18, ease: 'power3' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.18, ease: 'power3' });

    const move = (e: MouseEvent) => {
      xTo(e.clientX);
      yTo(e.clientY);
    };
    const over = (e: MouseEvent) => {
      const interactive = !!(e.target as HTMLElement).closest('a, button, [data-cursor]');
      gsap.to(el, {
        scale: interactive ? 2.6 : 1,
        borderColor: interactive ? '#e8d9bb' : '#c6a87c',
        duration: 0.25,
      });
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseover', over);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseover', over);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[100] hidden lg:block"
      style={{ width: 24, height: 24, borderRadius: '9999px', border: '1.5px solid #c6a87c', opacity: 0 }}
    />
  );
}
