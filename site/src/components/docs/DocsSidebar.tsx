'use client';

import { useState } from 'react';

interface NavItem {
  id: string;
  label: string;
}

interface NavSection {
  label: string;
  icon: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: 'Getting Started',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z', // lightning bolt
    items: [
      { id: 'what-is-ambr', label: 'What is Ambr' },
      { id: 'get-api-key', label: 'Get an API Key' },
      { id: 'first-contract', label: 'Your First Contract' },
    ],
  },
  {
    label: 'Contract Lifecycle',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', // document
    items: [
      { id: 'create', label: 'Create' },
      { id: 'share', label: 'Share' },
      { id: 'handshake', label: 'Handshake' },
      { id: 'sign', label: 'Sign' },
      { id: 'verify', label: 'Verify' },
    ],
  },
  {
    label: 'Agent Integration',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', // cog
    items: [
      { id: 'a2a-discovery', label: 'A2A Discovery' },
      { id: 'mcp-server', label: 'MCP Server' },
      { id: 'rest-api', label: 'REST API' },
      { id: 'x402-payments', label: 'x402 Pay-per-contract' },
    ],
  },
  {
    label: 'API Reference',
    icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4', // code
    items: [
      { id: 'endpoints', label: 'Endpoints' },
    ],
  },
  {
    label: 'Wallet & Identity',
    icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z', // key
    items: [
      { id: 'connect-wallet', label: 'Connect Wallet' },
      { id: 'wallet-auth', label: 'Wallet Auth' },
      { id: 'cnft', label: 'Contract NFTs' },
      { id: 'transfers', label: 'Transfers' },
    ],
  },
  {
    label: 'Payment Methods',
    icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z', // cash
    items: [
      { id: 'free-alpha', label: 'Free Alpha' },
      { id: 'crypto', label: 'Crypto' },
      { id: 'card', label: 'Card' },
    ],
  },
  {
    label: 'Trust Layer',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', // shield-check
    items: [
      { id: 'zk-identity', label: 'ZK Identity' },
    ],
  },
];

interface DocsSidebarProps {
  activeSection: string;
  onNavigate: (id: string) => void;
}

export default function DocsSidebar({ activeSection, onNavigate }: DocsSidebarProps) {
  const activeId = activeSection;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onNavigate(id);
      setMobileOpen(false);
    }
  };

  const filteredSections = searchQuery
    ? sections
        .map((s) => ({
          ...s,
          items: s.items.filter((i) =>
            i.label.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        }))
        .filter((s) => s.items.length > 0)
    : sections;

  const sidebarContent = (
    <nav className="flex flex-col gap-1 py-6 px-4">
      {/* Title */}
      <div className="flex items-center gap-2 mb-4 px-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber">
          <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-amber">Ambr Docs</span>
      </div>

      {/* Search */}
      <div className="relative mb-4 px-1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]">
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search docs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#111] border border-amber/10 rounded-none py-2 pl-8 pr-3 text-xs text-text-secondary placeholder:text-[#444] font-mono focus:outline-none focus:border-amber/40 transition-colors"
        />
      </div>

      {/* Sections */}
      {filteredSections.map((section, idx) => (
        <div key={section.label} className={idx > 0 ? 'mt-3' : ''}>
          <div className="flex items-center gap-2 px-2 mb-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber/50 flex-shrink-0">
              <path d={section.icon} />
            </svg>
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-amber/60">
              {section.label}
            </span>
          </div>
          <ul className="flex flex-col">
            {section.items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => scrollTo(item.id)}
                  className={`
                    block w-full text-left text-[0.8rem] py-1.5 pl-7 pr-2 transition-all duration-150
                    ${
                      activeId === item.id
                        ? 'text-amber border-l-2 border-amber bg-amber/5 font-medium'
                        : 'text-[#777] hover:text-text-primary border-l border-amber/10 hover:border-amber/30 hover:bg-white/[0.02]'
                    }
                  `}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Community + Version */}
      <div className="mt-8 px-2 space-y-4">
        <div>
          <span className="font-mono text-[0.55rem] uppercase tracking-widest text-[#444]">Community</span>
          <div className="flex items-center gap-3 mt-2">
            <a href="https://x.com/ambr_run" target="_blank" rel="noopener noreferrer" className="text-[#555] hover:text-amber transition-colors" aria-label="X (Twitter)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a href="https://discord.gg/HjvJFfjr" target="_blank" rel="noopener noreferrer" className="text-[#555] hover:text-amber transition-colors" aria-label="Discord">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </a>
            <a href="https://github.com/getambr/ambr" target="_blank" rel="noopener noreferrer" className="text-[#555] hover:text-amber transition-colors" aria-label="GitHub">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
          <span className="font-mono text-[0.6rem] text-[#555]">Alpha v1.0</span>
        </div>
      </div>
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed top-16 left-0 w-64 h-[calc(100vh-4rem)] bg-[#0a0a0a] border-r border-amber/15 overflow-y-auto z-20">
        {sidebarContent}
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-20 left-4 z-40 w-10 h-10 flex items-center justify-center bg-[#0a0a0a] border border-amber/30"
        aria-label="Toggle docs menu"
      >
        <svg
          width="18"
          height="14"
          viewBox="0 0 18 14"
          fill="none"
          className="text-amber"
        >
          {mobileOpen ? (
            <>
              <line x1="2" y1="2" x2="16" y2="12" stroke="currentColor" strokeWidth="1.5" />
              <line x1="2" y1="12" x2="16" y2="2" stroke="currentColor" strokeWidth="1.5" />
            </>
          ) : (
            <>
              <line x1="0" y1="1" x2="18" y2="1" stroke="currentColor" strokeWidth="1.5" />
              <line x1="0" y1="7" x2="18" y2="7" stroke="currentColor" strokeWidth="1.5" />
              <line x1="0" y1="13" x2="18" y2="13" stroke="currentColor" strokeWidth="1.5" />
            </>
          )}
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile slide-in panel */}
      <aside
        className={`
          lg:hidden fixed top-16 left-0 w-72 h-[calc(100vh-4rem)] bg-[#0a0a0a] border-r border-amber/15
          overflow-y-auto z-40 transition-transform duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
