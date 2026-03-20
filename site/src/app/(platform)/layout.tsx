import Navigation from '@/components/layout/Navigation';

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
    </>
  );
}
