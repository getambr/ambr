'use client';

import { useRef } from 'react';
import gsap from 'gsap';

interface Props {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
}

/** CTA that magnetically follows the cursor on hover, then springs back. */
export default function MagneticButton({ href, children, variant = 'primary' }: Props) {
  const ref = useRef<HTMLAnchorElement>(null);

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    gsap.to(el, {
      x: (e.clientX - (r.left + r.width / 2)) * 0.3,
      y: (e.clientY - (r.top + r.height / 2)) * 0.45,
      duration: 0.4,
      ease: 'power3.out',
    });
  };

  const onLeave = () => {
    if (ref.current) gsap.to(ref.current, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
  };

  const base =
    'inline-flex items-center justify-center px-7 py-3.5 text-xs uppercase tracking-wider transition-colors duration-300';
  const look =
    variant === 'primary'
      ? 'bg-amber text-background hover:bg-amber-light'
      : 'border border-amber/50 text-amber hover:border-amber';

  return (
    <a
      ref={ref}
      href={href}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      data-cursor
      className={`${base} ${look}`}
      style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}
    >
      {children}
    </a>
  );
}
