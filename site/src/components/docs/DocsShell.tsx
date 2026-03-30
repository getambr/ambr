'use client';

import { useState, useEffect, useCallback } from 'react';
import DocsSidebar from './DocsSidebar';
import DocsVisual from './DocsVisual';

const allSectionIds = [
  'what-is-ambr', 'get-api-key', 'first-contract',
  'create', 'share', 'handshake', 'sign', 'verify',
  'a2a-discovery', 'mcp-server', 'rest-api', 'x402-payments',
  'endpoints',
  'connect-wallet', 'wallet-auth', 'cnft', 'transfers',
  'free-alpha', 'crypto', 'card',
  'zk-identity',
];

export default function DocsShell({ children }: { children: React.ReactNode }) {
  const [activeSection, setActiveSection] = useState('what-is-ambr');

  const handleIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    const visible = entries
      .filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length > 0) {
      setActiveSection(visible[0].target.id);
    }
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: '-80px 0px -60% 0px',
      threshold: 0,
    });

    allSectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [handleIntersect]);

  return (
    <div className="relative">
      <DocsSidebar activeSection={activeSection} onNavigate={setActiveSection} />
      <div className="lg:ml-64">
        <div className="grid grid-cols-1 xl:grid-cols-[60%_35%] gap-[5%] xl:px-24">
          <div>{children}</div>
          <div className="hidden xl:block">
            <div className="sticky top-24 pt-28">
              <DocsVisual activeSection={activeSection} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
