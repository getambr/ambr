export default function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div id="main-content">
      {children}
    </div>
  );
}
