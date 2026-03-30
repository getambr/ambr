'use client';

import { useEffect, useState } from 'react';

interface DocsVisualProps {
  activeSection: string;
}

function VisualFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="relative border border-amber/30 bg-[#0a0a0a] p-4 overflow-hidden">
      {/* Inner frame */}
      <div className="absolute inset-2 border border-amber/10 pointer-events-none" />
      {/* Corner dots */}
      <div className="absolute top-2 left-2 w-1 h-1 bg-amber" />
      <div className="absolute top-2 right-2 w-1 h-1 bg-amber" />
      <div className="absolute bottom-2 left-2 w-1 h-1 bg-amber" />
      <div className="absolute bottom-2 right-2 w-1 h-1 bg-amber" />
      {/* Label */}
      <div className="font-mono text-[0.55rem] uppercase tracking-widest text-amber/50 mb-3 relative z-10">{label}</div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function ArchitectureDiagram() {
  return (
    <VisualFrame label="// Architecture">
      <svg viewBox="0 0 280 260" fill="none" className="w-full">
        {/* API box */}
        <rect x="90" y="10" width="100" height="32" stroke="#c6a87c" strokeWidth="1" fill="#c6a87c" fillOpacity="0.05" />
        <text x="140" y="30" textAnchor="middle" fill="#c6a87c" fontSize="10" fontFamily="monospace">REST API</text>

        {/* Arrow down */}
        <line x1="140" y1="42" x2="140" y2="60" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="3 3" />
        <polygon points="136,58 140,64 144,58" fill="#c6a87c" fillOpacity="0.5" />

        {/* Contract box */}
        <rect x="60" y="64" width="160" height="32" stroke="#c6a87c" strokeWidth="1.5" fill="#c6a87c" fillOpacity="0.08" />
        <text x="140" y="84" textAnchor="middle" fill="#f4f4f0" fontSize="11" fontFamily="monospace" fontWeight="500">Ricardian Contract</text>

        {/* Two arrows down */}
        <line x1="100" y1="96" x2="70" y2="130" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="3 3" />
        <line x1="180" y1="96" x2="210" y2="130" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="3 3" />

        {/* Human readable */}
        <rect x="5" y="130" width="130" height="40" stroke="#c6a87c" strokeWidth="0.5" fill="#c6a87c" fillOpacity="0.03" />
        <text x="70" y="147" textAnchor="middle" fill="#999" fontSize="8" fontFamily="monospace">HUMAN READABLE</text>
        <text x="70" y="162" textAnchor="middle" fill="#c6a87c" fontSize="9" fontFamily="monospace">Legal Prose + PDF</text>

        {/* Machine parsable */}
        <rect x="145" y="130" width="130" height="40" stroke="#c6a87c" strokeWidth="0.5" fill="#c6a87c" fillOpacity="0.03" />
        <text x="210" y="147" textAnchor="middle" fill="#999" fontSize="8" fontFamily="monospace">MACHINE PARSABLE</text>
        <text x="210" y="162" textAnchor="middle" fill="#c6a87c" fontSize="9" fontFamily="monospace">JSON + SHA-256</text>

        {/* Arrow to cNFT */}
        <line x1="140" y1="170" x2="140" y2="195" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="3 3" />
        <polygon points="136,193 140,200 144,193" fill="#c6a87c" fillOpacity="0.5" />

        {/* cNFT box */}
        <rect x="70" y="200" width="140" height="32" stroke="#c6a87c" strokeWidth="1" fill="#c6a87c" fillOpacity="0.05" />
        <text x="140" y="220" textAnchor="middle" fill="#c6a87c" fontSize="10" fontFamily="monospace">cNFT on Base L2</text>

        {/* Hash connection line */}
        <line x1="140" y1="96" x2="140" y2="200" stroke="#c6a87c" strokeWidth="0.3" strokeDasharray="1 4" opacity="0.2" />
      </svg>
    </VisualFrame>
  );
}

function ActivateWireframe() {
  return (
    <VisualFrame label="// Activate Page">
      <div className="space-y-3">
        <div className="border border-amber/20 p-3">
          <div className="font-mono text-[0.6rem] text-amber/50 mb-2">FREE ALPHA</div>
          <div className="h-2 w-24 bg-amber/20 mb-2" />
          <div className="font-mono text-xs text-[#666]">5 contracts included</div>
        </div>
        <div className="border border-amber/10 p-3 opacity-50">
          <div className="font-mono text-[0.6rem] text-[#555] mb-2">STARTER -- $29</div>
          <div className="h-2 w-20 bg-white/5 mb-2" />
          <div className="font-mono text-xs text-[#444]">50 contracts</div>
        </div>
        <div className="border border-amber/10 p-3 opacity-30">
          <div className="font-mono text-[0.6rem] text-[#444] mb-2">BUILDER -- $99</div>
          <div className="h-2 w-28 bg-white/5" />
        </div>
        <div className="mt-4 border border-amber/20 p-2">
          <div className="font-mono text-[0.6rem] text-[#555] mb-1">EMAIL</div>
          <div className="h-6 bg-white/[0.03] border border-amber/10" />
        </div>
        <div className="bg-amber/80 text-[#0a0a0a] text-center py-2 font-mono text-xs uppercase tracking-wider">
          Get Free API Key
        </div>
      </div>
    </VisualFrame>
  );
}

function ContractResponseCard() {
  return (
    <VisualFrame label="// Response">
      <pre className="text-[0.7rem] font-mono leading-relaxed overflow-hidden">
        <span className="text-[#555]">{'{'}</span>{'\n'}
        <span className="text-amber/70">  &quot;id&quot;</span><span className="text-[#555]">:</span> <span className="text-emerald-400/70">&quot;amb-2026-0042&quot;</span>{'\n'}
        <span className="text-amber/70">  &quot;hash&quot;</span><span className="text-[#555]">:</span> <span className="text-emerald-400/70">&quot;sha256:9f86d0...&quot;</span>{'\n'}
        <span className="text-amber/70">  &quot;status&quot;</span><span className="text-[#555]">:</span> <span className="text-emerald-400/70">&quot;draft&quot;</span>{'\n'}
        <span className="text-amber/70">  &quot;reader_url&quot;</span><span className="text-[#555]">:</span>{'\n'}
        <span className="text-emerald-400/70 text-[0.6rem]">    &quot;getamber.dev/reader/...&quot;</span>{'\n'}
        <span className="text-amber/70">  &quot;sign_url&quot;</span><span className="text-[#555]">:</span>{'\n'}
        <span className="text-emerald-400/70 text-[0.6rem]">    &quot;getamber.dev/reader/...&quot;</span>{'\n'}
        <span className="text-[#555]">{'}'}</span>
      </pre>
    </VisualFrame>
  );
}

function ShareFlowDiagram() {
  return (
    <VisualFrame label="// Share Flow">
      <svg viewBox="0 0 320 200" fill="none" className="w-full">
        {/* Creator */}
        <rect x="20" y="20" width="80" height="50" stroke="#c6a87c" strokeWidth="1" fill="#c6a87c" fillOpacity="0.05" />
        <text x="60" y="42" textAnchor="middle" fill="#999" fontSize="8" fontFamily="monospace">CREATOR</text>
        <text x="60" y="58" textAnchor="middle" fill="#c6a87c" fontSize="10" fontFamily="monospace">Agent / User</text>

        {/* Arrow */}
        <line x1="100" y1="45" x2="195" y2="45" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="4 3" />
        <polygon points="193,40 200,45 193,50" fill="#c6a87c" fillOpacity="0.5" />

        {/* Share token label */}
        <text x="150" y="38" textAnchor="middle" fill="#555" fontSize="7" fontFamily="monospace">share_token</text>

        {/* Counterparty */}
        <rect x="200" y="20" width="100" height="50" stroke="#c6a87c" strokeWidth="1" fill="#c6a87c" fillOpacity="0.05" />
        <text x="250" y="42" textAnchor="middle" fill="#999" fontSize="8" fontFamily="monospace">COUNTERPARTY</text>
        <text x="250" y="58" textAnchor="middle" fill="#c6a87c" fontSize="10" fontFamily="monospace">Reader Portal</text>

        {/* Reader Portal box */}
        <rect x="60" y="100" width="200" height="80" stroke="#c6a87c" strokeWidth="0.5" fill="#c6a87c" fillOpacity="0.03" rx="0" />
        <text x="160" y="120" textAnchor="middle" fill="#c6a87c" fontSize="10" fontFamily="monospace">Reader Portal</text>

        {/* Actions inside */}
        <text x="100" y="145" textAnchor="middle" fill="#999" fontSize="8" fontFamily="monospace">Review</text>
        <text x="160" y="145" textAnchor="middle" fill="#999" fontSize="8" fontFamily="monospace">Handshake</text>
        <text x="220" y="145" textAnchor="middle" fill="#999" fontSize="8" fontFamily="monospace">Sign</text>

        {/* Status badges */}
        <rect x="80" y="155" width="40" height="14" stroke="#c6a87c" strokeWidth="0.5" fill="#c6a87c" fillOpacity="0.1" />
        <text x="100" y="165" textAnchor="middle" fill="#c6a87c" fontSize="7" fontFamily="monospace">accept</text>

        <rect x="140" y="155" width="40" height="14" stroke="#c6a87c" strokeWidth="0.5" fill="#c6a87c" fillOpacity="0.1" />
        <text x="160" y="165" textAnchor="middle" fill="#c6a87c" fontSize="7" fontFamily="monospace">reject</text>

        <rect x="200" y="155" width="40" height="14" stroke="#c6a87c" strokeWidth="0.5" fill="#c6a87c" fillOpacity="0.1" />
        <text x="220" y="165" textAnchor="middle" fill="#c6a87c" fontSize="7" fontFamily="monospace">changes</text>

        {/* Arrow down from counterparty */}
        <line x1="250" y1="70" x2="250" y2="100" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="3 3" />
      </svg>
    </VisualFrame>
  );
}

function HandshakeVisual() {
  return (
    <VisualFrame label="// Handshake">
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-amber/10 pb-2">
          <span className="font-mono text-[0.65rem] text-[#666]">PARTY A</span>
          <span className="font-mono text-[0.65rem] text-emerald-400">ACCEPTED</span>
        </div>
        <div className="flex items-center justify-between border-b border-amber/10 pb-2">
          <span className="font-mono text-[0.65rem] text-[#666]">PARTY B</span>
          <span className="font-mono text-[0.65rem] text-amber">PENDING</span>
        </div>
        <div className="mt-4">
          <div className="font-mono text-[0.6rem] text-[#555] mb-2">VISIBILITY PREFERENCE</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-amber/30 bg-amber/5 p-2 text-center">
              <span className="font-mono text-[0.6rem] text-amber">private</span>
            </div>
            <div className="border border-amber/10 p-2 text-center">
              <span className="font-mono text-[0.6rem] text-[#555]">public</span>
            </div>
            <div className="border border-amber/10 p-2 text-center">
              <span className="font-mono text-[0.6rem] text-[#555]">metadata</span>
            </div>
            <div className="border border-amber/10 p-2 text-center">
              <span className="font-mono text-[0.6rem] text-[#555]">encrypted</span>
            </div>
          </div>
        </div>
      </div>
    </VisualFrame>
  );
}

function WalletSignVisual() {
  return (
    <VisualFrame label="// Wallet Signature">
      <svg viewBox="0 0 320 250" fill="none" className="w-full">
        {/* Wallet icon */}
        <rect x="110" y="10" width="100" height="40" stroke="#c6a87c" strokeWidth="1" fill="#c6a87c" fillOpacity="0.05" />
        <text x="160" y="35" textAnchor="middle" fill="#c6a87c" fontSize="10" fontFamily="monospace">Connect Wallet</text>

        {/* Arrow */}
        <line x1="160" y1="50" x2="160" y2="75" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="3 3" />

        {/* ECDSA box */}
        <rect x="80" y="75" width="160" height="35" stroke="#c6a87c" strokeWidth="0.5" fill="#c6a87c" fillOpacity="0.03" />
        <text x="160" y="97" textAnchor="middle" fill="#999" fontSize="9" fontFamily="monospace">ECDSA Signature Verification</text>

        {/* Arrow */}
        <line x1="160" y1="110" x2="160" y2="135" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="3 3" />

        {/* Two states */}
        <rect x="20" y="135" width="130" height="35" stroke="#c6a87c" strokeWidth="0.5" fill="#c6a87c" fillOpacity="0.03" />
        <text x="85" y="150" textAnchor="middle" fill="#999" fontSize="8" fontFamily="monospace">1ST SIGNATURE</text>
        <text x="85" y="163" textAnchor="middle" fill="#c6a87c" fontSize="9" fontFamily="monospace">status: pending</text>

        <rect x="170" y="135" width="130" height="35" stroke="#c6a87c" strokeWidth="1" fill="#c6a87c" fillOpacity="0.08" />
        <text x="235" y="150" textAnchor="middle" fill="#999" fontSize="8" fontFamily="monospace">2ND SIGNATURE</text>
        <text x="235" y="163" textAnchor="middle" fill="#f4f4f0" fontSize="9" fontFamily="monospace">status: active</text>

        {/* Arrow to cNFT */}
        <line x1="235" y1="170" x2="235" y2="198" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="3 3" />

        {/* cNFT mint */}
        <rect x="170" y="198" width="130" height="28" stroke="#c6a87c" strokeWidth="0.5" fill="#c6a87c" fillOpacity="0.05" />
        <text x="235" y="216" textAnchor="middle" fill="#c6a87c" fontSize="8" fontFamily="monospace">cNFT MINTED ON BASE</text>
      </svg>
    </VisualFrame>
  );
}

function A2ADiscoveryCard() {
  return (
    <VisualFrame label="// agent.json">
      <pre className="text-[0.65rem] font-mono leading-relaxed overflow-hidden">
        <span className="text-[#555]">{'{'}</span>{'\n'}
        <span className="text-amber/70">  &quot;name&quot;</span><span className="text-[#555]">:</span> <span className="text-emerald-400/70">&quot;Ambr&quot;</span>{'\n'}
        <span className="text-amber/70">  &quot;url&quot;</span><span className="text-[#555]">:</span>{'\n'}
        <span className="text-emerald-400/70 text-[0.6rem]">    &quot;getamber.dev/api/a2a&quot;</span>{'\n'}
        <span className="text-amber/70">  &quot;skills&quot;</span><span className="text-[#555]">: [</span>{'\n'}
        <span className="text-emerald-400/70">    &quot;create_contract&quot;</span>{'\n'}
        <span className="text-emerald-400/70">    &quot;list_templates&quot;</span>{'\n'}
        <span className="text-emerald-400/70">    &quot;verify_hash&quot;</span>{'\n'}
        <span className="text-emerald-400/70">    &quot;agent_handshake&quot;</span>{'\n'}
        <span className="text-[#555]">  ]</span>{'\n'}
        <span className="text-[#555]">{'}'}</span>
      </pre>
    </VisualFrame>
  );
}

function MCPConfigCard() {
  return (
    <VisualFrame label="// MCP Config">
      <pre className="text-[0.65rem] font-mono leading-relaxed overflow-hidden">
        <span className="text-[#555]">{'{'}</span>{'\n'}
        <span className="text-amber/70">  &quot;mcpServers&quot;</span><span className="text-[#555]">: {'{'}</span>{'\n'}
        <span className="text-amber/70">    &quot;ambr&quot;</span><span className="text-[#555]">: {'{'}</span>{'\n'}
        <span className="text-amber/70">      &quot;url&quot;</span><span className="text-[#555]">:</span>{'\n'}
        <span className="text-emerald-400/70 text-[0.6rem]">        &quot;getamber.dev/api/v1/mcp&quot;</span>{'\n'}
        <span className="text-amber/70">      &quot;headers&quot;</span><span className="text-[#555]">: {'{'}</span>{'\n'}
        <span className="text-amber/70">        &quot;X-API-Key&quot;</span><span className="text-[#555]">:</span>{'\n'}
        <span className="text-emerald-400/70">          &quot;YOUR_KEY&quot;</span>{'\n'}
        <span className="text-[#555]">      {'}'}</span>{'\n'}
        <span className="text-[#555]">    {'}'}</span>{'\n'}
        <span className="text-[#555]">  {'}'}</span>{'\n'}
        <span className="text-[#555]">{'}'}</span>
      </pre>
    </VisualFrame>
  );
}

function EndpointsCard() {
  const endpoints = [
    { method: 'POST', path: '/v1/contracts', label: 'Create' },
    { method: 'GET', path: '/v1/contracts/:id', label: 'Read' },
    { method: 'POST', path: '/v1/.../handshake', label: 'Handshake' },
    { method: 'POST', path: '/v1/.../sign', label: 'Sign' },
    { method: 'POST', path: '/v1/.../wallet-auth', label: 'Auth' },
    { method: 'GET', path: '/v1/templates', label: 'Templates' },
    { method: 'POST', path: '/v1/keys/free', label: 'Free Key' },
  ];

  return (
    <VisualFrame label="// 9 Endpoints">
      <div className="space-y-1.5">
        {endpoints.map((ep) => (
          <div key={ep.path} className="flex items-center gap-2 py-1 border-b border-amber/5">
            <span className={`font-mono text-[0.6rem] w-10 ${ep.method === 'POST' ? 'text-emerald-400/70' : 'text-amber/60'}`}>
              {ep.method}
            </span>
            <span className="font-mono text-[0.6rem] text-[#666] flex-1 truncate">{ep.path}</span>
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}

function WalletDashboardVisual() {
  return (
    <VisualFrame label="// Dashboard">
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="flex-1 border border-amber/20 p-2">
            <div className="font-mono text-[0.55rem] text-[#555]">CONTRACTS</div>
            <div className="font-serif text-xl text-amber">12</div>
          </div>
          <div className="flex-1 border border-amber/10 p-2">
            <div className="font-mono text-[0.55rem] text-[#555]">CREDITS</div>
            <div className="font-serif text-xl text-[#777]">38</div>
          </div>
        </div>
        <div className="border border-amber/10 p-2">
          <div className="font-mono text-[0.55rem] text-[#555] mb-2">RECENT</div>
          <div className="space-y-1">
            <div className="flex justify-between py-1 border-b border-amber/5">
              <span className="font-mono text-[0.6rem] text-[#777]">amb-2026-0042</span>
              <span className="font-mono text-[0.55rem] text-emerald-400/70">active</span>
            </div>
            <div className="flex justify-between py-1 border-b border-amber/5">
              <span className="font-mono text-[0.6rem] text-[#777]">amb-2026-0041</span>
              <span className="font-mono text-[0.55rem] text-amber">pending</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="font-mono text-[0.6rem] text-[#777]">amb-2026-0040</span>
              <span className="font-mono text-[0.55rem] text-[#555]">draft</span>
            </div>
          </div>
        </div>
      </div>
    </VisualFrame>
  );
}

function CNFTVisual() {
  return (
    <VisualFrame label="// cNFT on Base L2">
      <svg viewBox="0 0 320 200" fill="none" className="w-full">
        {/* NFT card */}
        <rect x="60" y="10" width="200" height="100" stroke="#c6a87c" strokeWidth="1" fill="#c6a87c" fillOpacity="0.05" />

        {/* Inner content */}
        <text x="160" y="35" textAnchor="middle" fill="#c6a87c" fontSize="11" fontFamily="monospace">ERC-721</text>
        <text x="160" y="55" textAnchor="middle" fill="#f4f4f0" fontSize="10" fontFamily="monospace">Contract #0042</text>

        <line x1="90" y1="65" x2="230" y2="65" stroke="#c6a87c" strokeWidth="0.3" />

        <text x="100" y="80" fill="#555" fontSize="8" fontFamily="monospace">HASH</text>
        <text x="230" y="80" textAnchor="end" fill="#c6a87c" fontSize="8" fontFamily="monospace">9f86d081884c...</text>

        <text x="100" y="95" fill="#555" fontSize="8" fontFamily="monospace">HOLDER</text>
        <text x="230" y="95" textAnchor="end" fill="#999" fontSize="8" fontFamily="monospace">0xba59...1524</text>

        <text x="100" y="105" fill="#555" fontSize="8" fontFamily="monospace">COUNTERPARTY</text>

        {/* Transfer gate */}
        <rect x="60" y="130" width="200" height="50" stroke="#c6a87c" strokeWidth="0.5" fill="#c6a87c" fillOpacity="0.03" />
        <text x="160" y="150" textAnchor="middle" fill="#999" fontSize="8" fontFamily="monospace">COUNTERPARTY-GATED TRANSFER</text>
        <text x="160" y="168" textAnchor="middle" fill="#c6a87c" fontSize="9" fontFamily="monospace">Both parties must approve</text>
      </svg>
    </VisualFrame>
  );
}

function TokensCard() {
  const tokens = [
    { name: 'USDC', type: 'Stablecoin' },
    { name: 'USDbC', type: 'Stablecoin' },
    { name: 'DAI', type: 'Stablecoin' },
    { name: 'ETH', type: 'Native' },
    { name: 'WETH', type: 'Wrapped' },
    { name: 'cbETH', type: 'Staked' },
    { name: 'cbBTC', type: 'Wrapped' },
  ];

  return (
    <VisualFrame label="// Base L2 Tokens">
      <div className="space-y-1.5">
        {tokens.map((t) => (
          <div key={t.name} className="flex items-center justify-between py-1 border-b border-amber/5">
            <span className="font-mono text-xs text-amber">{t.name}</span>
            <span className="font-mono text-[0.6rem] text-[#555]">{t.type}</span>
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}

function PricingCard() {
  return (
    <VisualFrame label="// Alpha Access">
      <div className="space-y-3">
        <div className="border border-amber/30 bg-amber/5 p-3">
          <div className="flex justify-between items-baseline mb-1">
            <span className="font-mono text-xs text-amber">FREE</span>
            <span className="font-mono text-[0.6rem] text-emerald-400">ACTIVE</span>
          </div>
          <div className="font-serif text-xl text-text-primary">5 contracts</div>
          <div className="font-mono text-[0.6rem] text-[#666] mt-1">Email only, no payment</div>
        </div>
        <div className="border border-amber/10 p-3 opacity-40">
          <div className="font-mono text-xs text-[#555]">STARTER -- $29</div>
          <div className="font-mono text-[0.6rem] text-[#444]">50 contracts</div>
        </div>
        <div className="border border-amber/10 p-3 opacity-25">
          <div className="font-mono text-xs text-[#444]">BUILDER -- $99</div>
          <div className="font-mono text-[0.6rem] text-[#333]">250 contracts</div>
        </div>
      </div>
    </VisualFrame>
  );
}

function ZKIdentityVisual() {
  return (
    <VisualFrame label="// ZK-SNARK Proof">
      <svg viewBox="0 0 320 270" fill="none" className="w-full">
        {/* Prover */}
        <rect x="20" y="10" width="110" height="40" stroke="#c6a87c" strokeWidth="1" fill="#c6a87c" fillOpacity="0.05" />
        <text x="75" y="28" textAnchor="middle" fill="#999" fontSize="8" fontFamily="monospace">PROVER</text>
        <text x="75" y="42" textAnchor="middle" fill="#c6a87c" fontSize="9" fontFamily="monospace">Private Inputs</text>

        {/* Trusted setup */}
        <rect x="200" y="10" width="110" height="40" stroke="#c6a87c" strokeWidth="0.5" fill="#c6a87c" fillOpacity="0.03" />
        <text x="255" y="28" textAnchor="middle" fill="#555" fontSize="8" fontFamily="monospace">CIRCUIT</text>
        <text x="255" y="42" textAnchor="middle" fill="#c6a87c" fontSize="9" fontFamily="monospace">Groth16 / BN128</text>

        {/* Arrow down from both to proof */}
        <line x1="75" y1="50" x2="75" y2="85" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="3 3" />
        <line x1="255" y1="50" x2="255" y2="85" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="3 3" />
        <line x1="75" y1="85" x2="255" y2="85" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="3 3" />
        <line x1="160" y1="85" x2="160" y2="100" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="3 3" />

        {/* Proof box */}
        <rect x="80" y="100" width="160" height="35" stroke="#c6a87c" strokeWidth="1.5" fill="#c6a87c" fillOpacity="0.08" />
        <text x="160" y="116" textAnchor="middle" fill="#f4f4f0" fontSize="10" fontFamily="monospace">π Proof</text>
        <text x="160" y="129" textAnchor="middle" fill="#c6a87c" fontSize="8" fontFamily="monospace">no personal data</text>

        {/* Arrow to verifier */}
        <line x1="160" y1="135" x2="160" y2="160" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="3 3" />

        {/* Verifier */}
        <rect x="80" y="160" width="160" height="35" stroke="#c6a87c" strokeWidth="0.5" fill="#c6a87c" fillOpacity="0.03" />
        <text x="160" y="176" textAnchor="middle" fill="#999" fontSize="8" fontFamily="monospace">VERIFIER</text>
        <text x="160" y="189" textAnchor="middle" fill="#c6a87c" fontSize="9" fontFamily="monospace">Merkle Oracle → Base L2</text>

        {/* Arrow to contract */}
        <line x1="160" y1="195" x2="160" y2="220" stroke="#c6a87c" strokeWidth="0.5" strokeDasharray="3 3" />

        {/* Contract record */}
        <rect x="60" y="220" width="200" height="30" stroke="#c6a87c" strokeWidth="0.5" fill="#c6a87c" fillOpacity="0.05" />
        <text x="160" y="237" textAnchor="middle" fill="#555" fontSize="8" fontFamily="monospace">identity_verified: true</text>
        <text x="160" y="248" textAnchor="middle" fill="#c6a87c" fontSize="8" fontFamily="monospace">on-chain alongside cNFT</text>
      </svg>
    </VisualFrame>
  );
}

const sectionVisuals: Record<string, () => React.ReactNode> = {
  'what-is-ambr': ArchitectureDiagram,
  'get-api-key': ActivateWireframe,
  'first-contract': ContractResponseCard,
  'create': ContractResponseCard,
  'share': ShareFlowDiagram,
  'handshake': HandshakeVisual,
  'sign': WalletSignVisual,
  'verify': ArchitectureDiagram,
  'a2a-discovery': A2ADiscoveryCard,
  'mcp-server': MCPConfigCard,
  'rest-api': EndpointsCard,
  'x402-payments': TokensCard,
  'endpoints': EndpointsCard,
  'connect-wallet': WalletDashboardVisual,
  'wallet-auth': WalletSignVisual,
  'cnft': CNFTVisual,
  'transfers': CNFTVisual,
  'free-alpha': PricingCard,
  'crypto': TokensCard,
  'card': PricingCard,
  'zk-identity': ZKIdentityVisual,
};

const sectionCaptions: Record<string, string> = {
  'what-is-ambr': 'Dual-format architecture: every contract exists as legal prose and machine-parsable JSON, linked by SHA-256 hash.',
  'get-api-key': 'Free alpha tier: enter your email to get an API key with 5 contracts. No payment required.',
  'first-contract': 'The API returns a contract object with hash, reader URL, and sign URL for the counterparty.',
  'create': 'POST /v1/contracts generates a Ricardian Contract with unique ID and cryptographic hash.',
  'share': 'The creator sends a reader URL to the counterparty. The share token grants read access without an API key.',
  'handshake': 'Both parties negotiate visibility (private, public, metadata-only, encrypted) before signing.',
  'sign': 'Two ECDSA wallet signatures activate the contract. First signature: pending. Second: active + cNFT minted.',
  'verify': 'Compare the SHA-256 hash against the on-chain record to verify the contract has not been tampered with.',
  'a2a-discovery': 'AI agents discover Ambr at /.well-known/agent.json — standard A2A protocol with 6 available skills.',
  'mcp-server': 'Add Ambr to Claude, Cursor, or any MCP-compatible agent with a single JSON config block.',
  'rest-api': '9 REST endpoints covering contract creation, signing, verification, delegation, and key management.',
  'x402-payments': 'Pay per contract with any of 7 supported tokens on Base L2. No subscription required.',
  'endpoints': 'Full API reference: POST/GET endpoints with API key, x402, share token, or wallet signature auth.',
  'connect-wallet': 'Dashboard supports dual login: API key for developers, wallet connect for on-chain identity.',
  'wallet-auth': 'ECDSA signature proves wallet ownership. Backend checks association via signatures, handshakes, or cNFT.',
  'cnft': 'Each contract is minted as an ERC-721 on Base L2 with its SHA-256 hash stored permanently on-chain.',
  'transfers': 'Counterparty-gated: both the holder and counterparty must approve before an NFT can be transferred.',
  'zk-identity': 'Groth16/BN128 zk-SNARK: prover generates a proof from private inputs, verifier checks it on-chain via Merkle oracle — no personal data on the blockchain.',
  'free-alpha': 'Alpha access is free. Paid tiers unlock more contracts and features when Ambr exits alpha.',
  'crypto': '7 tokens accepted on Base L2: stablecoins (USDC, USDbC, DAI) and volatile assets (ETH, WETH, cbETH, cbBTC).',
  'card': 'Stripe checkout for card payments. Currently in test mode — live payments coming soon.',
};

export default function DocsVisual({ activeSection }: DocsVisualProps) {
  const [currentSection, setCurrentSection] = useState(activeSection);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (activeSection !== currentSection) {
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setCurrentSection(activeSection);
        setIsTransitioning(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeSection, currentSection]);

  const Visual = sectionVisuals[currentSection] || ArchitectureDiagram;
  const caption = sectionCaptions[currentSection] || '';

  return (
    <div
      className={`transition-all duration-300 ${
        isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      }`}
    >
      <Visual />
      {caption && (
        <p className="mt-3 font-mono text-[0.65rem] text-[#555] leading-relaxed px-1">
          {caption}
        </p>
      )}
    </div>
  );
}
