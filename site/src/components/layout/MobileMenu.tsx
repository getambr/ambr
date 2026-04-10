'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SmartCTA from './SmartCTA';

const marketingLinks = [
  { href: '/', label: 'Home' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/ecosystem', label: 'Ecosystem' },
];

const platformLinks = [
  { href: '/docs', label: 'Docs' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/developers', label: 'Developers' },
  { href: '/templates', label: 'Templates' },
  { href: '/reader', label: 'Reader' },
];

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
}

export default function MobileMenu({ isOpen, onClose, currentPath }: MobileMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      menuRef.current?.focus();
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          initial={{ opacity: 0, x: '100%' }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: '100%' }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="fixed inset-0 z-[60] bg-[#0a0a0a] flex flex-col"
        >
          <div className="absolute inset-0 grid-bg grid-bg-dark opacity-30 pointer-events-none" />
          <div className="relative z-10 flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="" width={32} height={32} className="rounded-sm" />
              <span className="text-xl font-serif text-amber">Ambr</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-amber hover:text-amber-light"
              aria-label="Close menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="relative z-10 flex flex-col gap-2 px-4 pt-8">
            {(() => {
              const host = typeof window !== 'undefined' ? window.location.hostname : '';
              const marketingPaths = ['/', '/how-it-works', '/ecosystem', '/waitlist', '/privacy', '/terms'];
              const links = host.includes('ambr.run') ? marketingLinks
                : host.includes('getamber.dev') ? platformLinks
                : marketingPaths.includes(currentPath) ? marketingLinks : platformLinks;
              return links;
            })().map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className={`rounded-none px-4 py-3 text-lg transition-colors ${
                  currentPath === link.href
                    ? 'border-l-2 border-amber text-amber font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {(() => {
              const host = typeof window !== 'undefined' ? window.location.hostname : '';
              const isMarketingSite = host.includes('ambr.run') || (!host.includes('getamber.dev') && ['/', '/how-it-works', '/ecosystem', '/waitlist', '/privacy', '/terms'].includes(currentPath));
              return isMarketingSite ? (
                <Link
                  href="https://getamber.dev/dashboard"
                  onClick={onClose}
                  className="mt-4 rounded-none border border-amber/30 px-4 py-3 text-center font-mono text-sm uppercase tracking-wider text-amber transition-colors hover:bg-amber/10 block"
                >
                  Sign in
                </Link>
              ) : null;
            })()}
            <SmartCTA
              onClick={onClose}
              className="mt-4 rounded-none bg-amber px-4 py-3 text-center font-mono text-sm uppercase tracking-wider font-medium text-background transition-colors hover:bg-amber-light block"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
