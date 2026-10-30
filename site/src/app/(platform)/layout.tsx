import Navigation from '@/components/layout/Navigation';
import Footer from '@/components/layout/Footer';

/**
 * Note the asymmetry with (marketing)/layout.tsx: that one puts `pt-16` on the
 * wrapper, this one does not. Six platform pages hand-roll their own top offset
 * instead (pt-16 through pt-28), so adding it here would double-pad every one
 * of them. Normalising that means touching the dashboard and reader, which is a
 * separate pass — the offsets are inconsistent but each page is individually
 * correct against the fixed h-16 nav.
 */
export default function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Navigation />
      <div id="main-content">
        {children}
      </div>
      <Footer />
    </>
  );
}
