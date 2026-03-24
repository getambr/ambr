import Link from 'next/link';
import Image from 'next/image';

const marketingLinks = [
  { href: '/', label: 'Home' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/use-cases', label: 'Use Cases' },
  { href: '/ecosystem', label: 'Ecosystem' },
];

const platformLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/developers', label: 'Developers' },
  { href: 'https://getamber.dev', label: 'Activate' },
];

const legalLinks = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-amber/20 bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="" width={28} height={28} className="rounded-sm" />
              <div>
                <span className="text-lg font-serif text-amber">Ambr</span>
              </div>
            </div>
            <p className="mt-3 font-mono text-xs text-[#666]">
              The Agreement Layer for the AI Agent Economy.
            </p>
          </div>

          <div>
            <h3 className="font-mono text-xs uppercase tracking-wide text-text-primary mb-3">Product</h3>
            <ul className="space-y-2">
              {marketingLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="font-mono text-xs text-[#666] hover:text-amber transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-mono text-xs uppercase tracking-wide text-text-primary mb-3">Platform</h3>
            <ul className="space-y-2">
              {platformLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="font-mono text-xs text-[#666] hover:text-amber transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-mono text-xs uppercase tracking-wide text-text-primary mb-3">Legal</h3>
            <ul className="space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="font-mono text-xs text-[#666] hover:text-amber transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-amber/20 pt-6 text-center">
          <p className="font-mono text-xs text-[#666] mb-2">
            Ambr is contract infrastructure, not a law firm. Generated contracts are not legal advice.
          </p>
          <p className="font-mono text-xs text-[#666]">
            &copy; 2026 Ambr. All rights reserved.
          </p>
          <p className="mt-4 font-mono text-xs text-amber tracking-widest uppercase">
            SYS.STATUS: OPERATIONAL
          </p>
        </div>
      </div>
    </footer>
  );
}
