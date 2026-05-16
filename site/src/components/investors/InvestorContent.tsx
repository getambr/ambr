import { getSupabase } from '@/lib/supabase';
import { loadInvestorFigures } from '@/lib/investor-figures';
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
  const [stats, figures] = await Promise.all([getTractionStats(), loadInvestorFigures()]);
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
            {figures.hero}
          </p>

          <div className="border border-amber/60 bg-amber/5 p-6 max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-wider text-amber mb-2">
              The Ask
            </p>
            <p className="text-3xl text-text-primary font-serif mb-2">
              {figures.ask.headline}
            </p>
            {figures.ask.subhead && (
              <p className="text-sm text-text-secondary">
                {figures.ask.subhead}
              </p>
            )}
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
            {figures.deck.tag}
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">
            {figures.deck.title}
          </h2>

          {figures.deck.slideCount > 0 && (
            <div className="space-y-4">
              {Array.from({ length: figures.deck.slideCount }, (_, i) => i + 1).map((n) => (
                <figure
                  key={n}
                  className="border border-amber/40 bg-surface overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/v1/investors/slide/${n}`}
                    alt={`Ambr pitch deck · slide ${n} of ${figures.deck.slideCount}`}
                    loading={n <= 2 ? 'eager' : 'lazy'}
                    decoding="async"
                    className="block w-full h-auto"
                    width={1280}
                    height={720}
                  />
                  <figcaption className="px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-amber/70 border-t border-amber/20">
                    slide {n} / {figures.deck.slideCount}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <a
              href="/api/v1/investors/deck"
              download={figures.deck.pdfFilename}
              className="inline-block rounded-none bg-amber px-4 py-2 text-xs font-mono uppercase tracking-wide text-background hover:bg-amber-light transition-colors"
            >
              Download Pitch Deck (PDF)
            </a>
          </div>
        </section>

        {/* ───── Financial highlights ───── */}
        <section>
          <p className="font-mono text-xs uppercase tracking-widest text-amber mb-3">
            {figures.model.tag}
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">
            {figures.model.title}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <FinancialYearCard {...figures.model.years.y1} />
            <FinancialYearCard {...figures.model.years.y2} />
            <FinancialYearCard {...figures.model.years.y3} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="border border-amber/40 bg-amber/5 p-5">
              <p className="font-mono text-xs uppercase tracking-wider text-amber mb-2">
                M36 Exit ARR
              </p>
              <p className="text-3xl text-text-primary font-serif">{figures.model.m36Arr}</p>
              <p className="text-xs text-text-secondary mt-1">year-3 exit run-rate</p>
            </div>
            <div className="border border-amber/30 bg-surface/80 p-5">
              <p className="font-mono text-xs uppercase tracking-wider text-amber mb-2">
                3-yr Cumulative EBITDA
              </p>
              <p className="text-3xl text-text-primary font-serif">{figures.model.cumulativeEbitda}</p>
            </div>
            <div className="border border-amber/30 bg-surface/80 p-5">
              <p className="font-mono text-xs uppercase tracking-wider text-amber mb-2">
                Peak Monthly Burn
              </p>
              <p className="text-3xl text-text-primary font-serif">{figures.model.peakBurn}</p>
            </div>
          </div>

          <div className="border border-amber/20 bg-surface/50 p-4">
            <p className="text-xs text-text-secondary leading-relaxed">
              {figures.model.assumptions}
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
            Variable cost per contract ~$0.012 (Base L2 gas + Claude Haiku LLM + infra).
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
              detail="Operations + go-to-market. Drives partnerships, customer onboarding, and revenue."
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
              <strong className="text-text-primary font-mono text-xs">v0.3.9 · May 2026</strong> — Investor package v0.3.9 (16-slide briefing) · pricing reconciliation · A2A agent card live on /.well-known/agent.json · Founder Program live on /founders
            </li>
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
              {figures.ask.contactCta}
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
