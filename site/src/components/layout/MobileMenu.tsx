'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const marketingLinks = [
  { href: '/', label: 'Home' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/ecosystem', label: 'Ecosystem' },
];

const platformLinks = [
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
          className="fixed inset-0 z-[60] bg-background flex flex-col"
        >
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="" width={32} height={32} className="rounded-sm" />
              <span className="text-xl font-serif text-amber">Ambr</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-text-secondary hover:text-text-primary"
              aria-label="Close menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-2 px-4 pt-8">
            {(() => {
              const host = typeof window !== 'undefined' ? window.location.hostname : '';
              const links = host.includes('ambr.run') ? marketingLinks
                : host.includes('getamber.dev') ? platformLinks
                : [...marketingLinks, ...platformLinks];
              return links;
            })().map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className={`rounded-lg px-4 py-3 text-lg transition-colors ${
                  currentPath === link.href
                    ? 'bg-amber-glow text-amber font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/activate"
              onClick={onClose}
              className="mt-4 rounded-lg bg-amber px-4 py-3 text-center text-lg font-medium text-background transition-colors hover:bg-amber-light"
            >
              Get Started
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
