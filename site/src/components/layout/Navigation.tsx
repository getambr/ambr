'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import MobileMenu from './MobileMenu';
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

function useNavLinks() {
  const [links, setLinks] = useState([...marketingLinks, ...platformLinks]);

  useEffect(() => {
    const host = window.location.hostname;
    if (host.includes('ambr.run')) {
      setLinks(marketingLinks);
    } else if (host.includes('getamber.dev')) {
      setLinks(platformLinks);
    }
    // localhost/preview: keep all links
  }, []);

  return links;
}

export default function Navigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navLinks = useNavLinks();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 mix-blend-difference ${
          scrolled
            ? 'bg-background/80 backdrop-blur-sm border-b border-white/10'
            : 'bg-transparent backdrop-blur-[4px] border-b border-white/10'
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.png" alt="" width={32} height={32} className="rounded-sm" />
              <span className="text-xl font-serif text-amber">Ambr</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`font-mono text-xs uppercase tracking-wide transition-colors ${
                    pathname === link.href
                      ? 'text-amber font-medium'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <SmartCTA
                className="rounded-none bg-amber px-4 py-2 font-mono text-xs uppercase tracking-wide font-medium text-background transition-colors hover:bg-amber-light"
              />
            </div>

            <button
              type="button"
              className="md:hidden p-2 text-text-secondary hover:text-text-primary"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      <MobileMenu
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        currentPath={pathname}
      />
    </>
  );
}
