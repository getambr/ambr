import { getSupabase } from '@/lib/supabase';
import InvestorLogoutButton from './InvestorLogoutButton';

// ---------------------------------------------------------------------------
// Live traction stats (from DB)
// ---------------------------------------------------------------------------

interface TractionStats {
  total_contracts: number;
  active_contracts: number;
  minted_cnfts: number;
  active_api_keys: number;
  paying_keys: number;
  templates_available: number;
  last_contract_date: string | null;
}

async function getTractionStats(): Promise<TractionStats> {
  const db = getSupabase();

  const [contracts, activeContracts, mintedContracts, apiKeys, payingKeys, templates, latestContract] = await Promise.all([
    db.from('contracts').select('id', { count: 'exact', head: true }),
    db.from('contracts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('contracts').select('id', { count: 'exact', head: true }).eq('nft_mint_status', 'minted'),
    db.from('api_keys').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db.from('api_keys').select('id', { count: 'exact', head: true }).eq('is_active', true).in('payment_method', ['stripe', 'crypto']),
    db.from('templates').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db.from('contracts').select('created_at').order('created_at', { ascending: false }).limit(1).single(),
  ]);

  return {
    total_contracts: contracts.count ?? 0,
    active_contracts: activeContracts.count ?? 0,
    minted_cnfts: mintedContracts.count ?? 0,
    active_api_keys: apiKeys.count ?? 0,
    paying_keys: payingKeys.count ?? 0,
    templates_available: templates.count ?? 0,
    last_contract_date: latestContract.data?.created_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default async function InvestorContent() {
  const stats = await getTractionStats();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="bg-background min-h-screen">
      {/* Top bar — signed in banner */}
      <div className="border-b border-amber/20 bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between">
          <span className="font-mono text-xs text-amber">
            Ambr · Confidential · {today}
          </span>
          <InvestorLogoutButton />
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-12 space-y-16">
        {/* ───── Hero + Ask ───── */}
        <section>
          <p className="font-mono text-xs uppercase tracking-widest text-amber mb-3">
            Investor Package
          </p>
          <h1 className="text-4xl sm:text-5xl text-text-primary font-serif leading-tight mb-4">
            The Contracts Layer for the AI Agent Economy
          </h1>
          <p className="text-lg text-text-secondary leading-relaxed max-w-3xl mb-8">
            700M AI agents are already in production. They transact.
            But no transaction is legally enforceable — there is no agreement layer.
            Ambr issues Ricardian contracts — human-readable, machine-executable agreements — that agents can sign, verify, and enforce on-chain.
          </p>

          <div className="border border-amber/60 bg-amber/5 p-6 max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-wider text-amber mb-2">
              The Ask
            </p>
            <p className="text-3xl text-text-primary font-serif mb-2">
              $500K pre-seed at $15M cap
            </p>
            <p className="text-sm text-text-secondary">
              SAFE · Bootstrap (months 1–6) · 78% marketing, 18% founder stipends, 1% legal, 3% infra
            </p>
          </div>
        </section>

        {/* ───── Live traction ───── */}
        <section>
          <p className="font-mono text-xs uppercase tracking-widest text-amber mb-3">
            Live System · Production
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">Current Traction</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Contracts generated" value={String(stats.total_contracts)} sublabel={`${stats.active_contracts} active`} />
            <StatCard label="Compressed NFTs on Base L2" value={String(stats.minted_cnfts)} sublabel="on-chain proof" />
            <StatCard label="Active API keys" value={String(stats.active_api_keys)} sublabel={`${stats.paying_keys} paid`} />
            <StatCard label="Contract templates" value={String(stats.templates_available)} sublabel="live on MCP (Model Context Protocol)" />
          </div>

          <div className="mt-4 text-xs text-text-secondary/70 space-y-1">
            <p>
              • MCP endpoint (<code className="text-amber">getamber.dev/api/mcp</code>) receiving{' '}
              <strong className="text-text-primary">~1.5M requests/week</strong> from AI agent directories and crawlers.
            </p>
            <p>
              • Stripe live + x402 USDC payments live on Base mainnet · HTTP 402 payment instructions wired April 19.
            </p>
            <p>
              • Paying conversions starting now — infrastructure layer complete, distribution phase (seed priority).
            </p>
          </div>
        </section>

        {/* ───── Pitch deck ───── */}
        <section>
          <p className="font-mono text-xs uppercase tracking-widest text-amber mb-3">
            Pitch Deck · v0.2
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">
            14-slide overview
          </h2>

          {/* 14 slides rendered at 1920×1080 from the latest v0.2-r5 deck */}
          <div className="space-y-4">
            {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
              <figure
                key={n}
                className="border border-amber/40 bg-surface overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/v1/investors/slide/${n}`}
                  alt={`Ambr pitch deck · slide ${n} of 14`}
                  loading={n <= 2 ? 'eager' : 'lazy'}
                  decoding="async"
                  className="block w-full h-auto"
                  width={1920}
                  height={1080}
                />
                <figcaption className="px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-amber/70 border-t border-amber/20">
                  slide {n} / 14
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="mt-4 flex gap-3">
            <a
              href="/api/v1/investors/deck"
              download="ambr-pitch-deck.pdf"
              className="inline-block rounded-none bg-amber px-4 py-2 text-xs font-mono uppercase tracking-wide text-background hover:bg-amber-light transition-colors"
            >
              Download Pitch Deck (PDF)
            </a>
            <a
              href="/api/v1/investors/model"
              download="ambr-financial-model-v0.3.6.xlsx"
              className="inline-block rounded-none border border-amber bg-transparent px-4 py-2 text-xs font-mono uppercase tracking-wide text-amber hover:bg-amber/10 transition-colors"
            >
              Download Financial Model v0.3.6 (xlsx)
            </a>
          </div>
        </section>

        {/* ───── Financial highlights ───── */}
        <section>
          <p className="font-mono text-xs uppercase tracking-widest text-amber mb-3">
            Financial Model · v0.3.6 (Dainis-approved · Real scenario)
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">
            Bootstrap-Funded Path to $450M ARR
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <FinancialYearCard
              label="Year 1 · 2026"
              revenue="$2.08M"
              ebitda="+$1.14M"
              margin="55% EBITDA"
              share="0.2% market share"
            />
            <FinancialYearCard
              label="Year 2 · 2027"
              revenue="$39.1M"
              ebitda="+$26.6M"
              margin="68% EBITDA"
              share="1% market share"
            />
            <FinancialYearCard
              label="Year 3 · 2028"
              revenue="$247M"
              ebitda="+$172.5M"
              margin="70% EBITDA"
              share="3% market share"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="border border-amber/40 bg-amber/5 p-5">
              <p className="font-mono text-xs uppercase tracking-wider text-amber mb-2">
                M36 EXIT ARR
              </p>
              <p className="text-3xl text-text-primary font-serif">$450M</p>
              <p className="text-xs text-text-secondary mt-1">year-3 exit run-rate</p>
            </div>
            <div className="border border-amber/30 bg-surface/80 p-5">
              <p className="font-mono text-xs uppercase tracking-wider text-amber mb-2">
                3-yr Cumulative EBITDA
              </p>
              <p className="text-3xl text-text-primary font-serif">$200.3M</p>
            </div>
            <div className="border border-amber/30 bg-surface/80 p-5">
              <p className="font-mono text-xs uppercase tracking-wider text-amber mb-2">
                Peak Monthly Burn
              </p>
              <p className="text-3xl text-text-primary font-serif">$81.1K</p>
            </div>
          </div>

          <div className="border border-amber/20 bg-surface/50 p-4">
            <p className="text-xs text-text-secondary leading-relaxed">
              <strong className="text-text-primary">Assumptions (v0.3.6):</strong>{' '}
              700M agents Jan 2026 (Barclays), 95% CAGR (METR + Gartner), 20% need formal authorization,
              30 contracts/agent/year, $0.50 blended ARPU. Period: 36 months · May 2026 → Apr 2029.
              Methodology: year-end market share × monthly TAM (linear ramp).
              M1–M6 bootstrap burn covered by $500K pre-seed. Headcount Y3-end: 107. Gross margin 97.7%.
            </p>
          </div>
        </section>

        {/* ───── Pricing ───── */}
        <section>
          <p className="font-mono text-xs uppercase tracking-widest text-amber mb-3">
            Unit Economics
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">
            Pay per contract · 88–99% margin
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <PricingCard tier="Consumer (A2C)" price="$0.20" note="88% margin" />
            <PricingCard tier="Delegation (A2A)" price="$0.50" note="95% margin" />
            <PricingCard tier="Commerce (B2A)" price="$1.00" note="98% margin" />
            <PricingCard tier="Fleet Multi-Agent" price="$2.50" note="99% margin" />
          </div>
          <p className="mt-4 text-xs text-text-secondary/70">
            Variable cost per contract ~$0.024 (Base L2 gas + Claude Haiku LLM + infra).
            Zero direct competitors. Pricing mirrors the natural segmentation Stripe used for credit cards →
            we become the economic substrate for agent commerce.
          </p>
        </section>

        {/* ───── Team ───── */}
        <section>
          <p className="font-mono text-xs uppercase tracking-widest text-amber mb-3">
            Team · OMRA Corp. (Delaware)
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">
            Three founders, aligned equity
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TeamCard
              name="Dainis Krisjanis"
              role="CEO"
              detail="Corporate governance, finance, strategy. OMRA Corp. CEO."
            />
            <TeamCard
              name="Ilvers Sermols"
              role="CTO"
              detail="Product + engineering. Built Ambr contract engine, MCP server, x402 integration."
            />
            <TeamCard
              name="Bruno Krisjanis"
              role="CBO"
              detail="Business development, partnerships, ops coordination."
            />
          </div>
        </section>

        {/* ───── What's live ───── */}
        <section>
          <p className="font-mono text-xs uppercase tracking-widest text-amber mb-3">
            Shipping Log
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">Recently deployed</h2>

          <ul className="space-y-3 text-sm text-text-secondary">
            <li>
              <strong className="text-text-primary font-mono text-xs">v0.3.0 · Apr 2026</strong> — MCP x402 paywall, Stripe live, dashboard billing panel, pricing realignment, Founder Program
            </li>
            <li>
              <strong className="text-text-primary font-mono text-xs">v0.2.0 · Apr 2026</strong> — Bilateral amendments, paired cNFTs, EU AI Act Art 14 oversight, security hardening
            </li>
            <li>
              <strong className="text-text-primary font-mono text-xs">v0.1.0 · Mar 2026</strong> — Initial public launch: contract engine, 6 templates, Reader portal, REST + MCP APIs, x402, cNFT minting on Base
            </li>
          </ul>
          <p className="mt-4 text-xs text-text-secondary/70">
            Full history:{' '}
            <a href="https://github.com/getambr/ambr/blob/master/CHANGELOG.md" target="_blank" rel="noopener noreferrer" className="text-amber hover:underline">
              github.com/getambr/ambr/CHANGELOG.md
            </a>
            {' · '}
            Public docs:{' '}
            <a href="/docs" className="text-amber hover:underline">getamber.dev/docs</a>
            {' · '}
            Homepage:{' '}
            <a href="https://ambr.run" className="text-amber hover:underline">ambr.run</a>
          </p>
        </section>

        {/* ───── Contact ───── */}
        <section>
          <p className="font-mono text-xs uppercase tracking-widest text-amber mb-3">
            Next Steps
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">
            Let&apos;s talk
          </h2>

          <div className="border border-amber/40 bg-surface/80 p-6 max-w-2xl">
            <p className="text-sm text-text-secondary mb-4">
              We&apos;re actively raising the $500K pre-seed. The fastest path forward is a 30-minute call
              with Dainis to align on terms, followed by a technical session with Ilvers if you want
              to see the product in action.
            </p>
            <div className="space-y-2 font-mono text-sm">
              <p>
                <span className="text-text-secondary">CEO:</span>{' '}
                <a href="mailto:dainis@ambr.run" className="text-amber hover:underline">
                  dainis@ambr.run
                </a>
              </p>
              <p>
                <span className="text-text-secondary">CTO:</span>{' '}
                <a href="mailto:ilvers@ambr.run" className="text-amber hover:underline">
                  ilvers@ambr.run
                </a>
              </p>
              <p>
                <span className="text-text-secondary">CBO:</span>{' '}
                <a href="mailto:bruno@ambr.run" className="text-amber hover:underline">
                  bruno@ambr.run
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* ───── Footer ───── */}
        <footer className="border-t border-amber/20 pt-6 text-center">
          <p className="font-mono text-xs text-text-secondary/60 mb-2">
            Ambr is contract infrastructure, not a law firm. Generated contracts are not legal advice.
          </p>
          <p className="font-mono text-xs text-amber/70 tracking-widest uppercase">
            ambr · confidential · {today}
          </p>
        </footer>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Small reusable cards
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="border border-amber/30 bg-surface/80 p-4">
      <p className="font-mono text-[0.65rem] uppercase tracking-wider text-amber/80">{label}</p>
      <p className="text-3xl font-serif text-text-primary mt-2">{value}</p>
      {sublabel && <p className="text-xs text-text-secondary mt-1">{sublabel}</p>}
    </div>
  );
}

function FinancialYearCard({
  label,
  revenue,
  ebitda,
  margin,
  share,
}: {
  label: string;
  revenue: string;
  ebitda: string;
  margin: string;
  share: string;
}) {
  return (
    <div className="border border-amber/40 bg-surface/80 p-5">
      <p className="font-mono text-xs uppercase tracking-wider text-amber mb-3">{label}</p>
      <p className="text-2xl text-text-primary font-serif mb-1">{revenue}</p>
      <p className="text-sm text-text-secondary">Revenue</p>
      <div className="mt-3 pt-3 border-t border-amber/20">
        <p className="text-lg text-text-primary font-serif">{ebitda}</p>
        <p className="text-xs text-text-secondary">{margin}</p>
        <p className="text-xs text-text-secondary/70 mt-1">{share}</p>
      </div>
    </div>
  );
}

function PricingCard({ tier, price, note }: { tier: string; price: string; note: string }) {
  return (
    <div className="border border-amber/30 bg-surface/80 p-4 text-center">
      <p className="font-mono text-[0.65rem] uppercase tracking-wider text-amber/80 mb-2">{tier}</p>
      <p className="text-2xl font-serif text-text-primary">{price}</p>
      <p className="text-xs text-text-secondary/70 mt-1">{note}</p>
    </div>
  );
}

function TeamCard({ name, role, detail }: { name: string; role: string; detail: string }) {
  return (
    <div className="border border-amber/30 bg-surface/80 p-5">
      <p className="font-mono text-xs uppercase tracking-wider text-amber mb-2">{role}</p>
      <h3 className="text-lg text-text-primary font-serif mb-2">{name}</h3>
      <p className="text-xs text-text-secondary leading-relaxed">{detail}</p>
    </div>
  );
}
