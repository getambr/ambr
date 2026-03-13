import Link from 'next/link';
import Image from 'next/image';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/use-cases', label: 'Use Cases' },
  { href: '/developers', label: 'Developers' },
  { href: '/ecosystem', label: 'Ecosystem' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="" width={28} height={28} className="rounded-sm" />
              <div>
                <span className="text-lg font-bold text-amber">Ambr</span>
              </div>
            </div>
            <p className="mt-3 text-sm text-text-secondary">
              The Agreement Layer for the AI Agent Economy.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-text-primary mb-3">Navigation</h3>
            <ul className="space-y-2">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-text-secondary hover:text-amber transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium text-text-primary mb-3">Legal</h3>
            <div className="space-y-1">
              <Link href="/privacy" className="block text-sm text-text-secondary hover:text-amber transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="block text-sm text-text-secondary hover:text-amber transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-6 text-center">
          <p className="text-xs text-text-secondary/50 mb-2">
            Ambr is contract infrastructure, not a law firm. Generated contracts are not legal advice.
          </p>
          <p className="text-sm text-text-secondary">
            © {year} Ambr. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
