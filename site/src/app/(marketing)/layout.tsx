import Navigation from '@/components/layout/Navigation';
import Footer from '@/components/layout/Footer';

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Navigation />
      <div id="main-content" className="pt-16">{children}</div>
      <Footer />
    </>
  );
}
