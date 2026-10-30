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
          <p className="text-micro mb-3">
            Investor Package
          </p>
          <h1 className="text-4xl sm:text-5xl text-text-primary font-serif leading-tight mb-4">
            The Agent Mandate &amp; Binding Registry
          </h1>
          <p className="text-lg text-text-secondary leading-relaxed max-w-3xl mb-8">
            {figures.hero}
          </p>

          <div className="border border-amber/60 bg-amber/5 p-6 max-w-2xl">
            <p className="text-micro mb-2">
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
          <p className="text-micro mb-3">
            Live System · Production
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">Production-live since March 2026</h2>

          <div className="border border-amber/30 bg-surface/80 p-5 space-y-3 text-sm text-text-secondary leading-relaxed">
            <p>
              <strong className="text-text-primary">Contract engine, MCP server, x402 paywall, and cNFT minting on Base mainnet</strong> are all live in production today.
              {/* No document version here. "v0.3.9" is a pitch-deck FILENAME, as v0.3.8/v0.6
                  are model filenames — document versions, never product versions. If a version is
                  ever wanted, it must be a real repo release tag. */}
              <span className="text-text-secondary/70">{' '}{stats.templates_available} Ricardian contract templates are live on Base mainnet — discoverable over MCP, signable in the browser, redeemable on-chain.</span>
            </p>
            <p>
              MCP endpoint (<code className="text-amber font-mono text-xs">getamber.dev/api/mcp</code>) receiving high-volume crawler + agent-directory traffic.
              Stripe live and x402 USDC payments wired on Base mainnet.
            </p>
            <p className="text-text-secondary/70">
              Distribution phase is the seed priority — infrastructure layer is complete and shipping; growth comes from getting agent platforms and fintechs onto the rail.
            </p>
          </div>
        </section>

        {/* ───── One-pager ─────
            Sits ABOVE the deck deliberately: this is the forwardable artefact,
            and it read in 90 seconds where the deck takes 15 minutes. It was
            live and gated for a while with nothing linking to it — the only way
            in was knowing the URL. Do not remove the link when reordering. */}
        <section>
          <p className="text-micro mb-3">
            One-pager
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-4">
            The 90-second version
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed max-w-2xl mb-6">
            What Ambr is, where it stands, the ask, and the liquidity path — on a single
            forwardable page, in plain language and behind no gate.
          </p>
          <div className="flex gap-3 flex-wrap items-center">
            <a
              href="/what-it-is"
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-none bg-amber px-5 py-2.5 text-xs font-mono uppercase tracking-wide text-background hover:bg-amber-light transition-colors"
            >
              Read the one-pager
            </a>
            {/* There is deliberately no secondary "Detailed brief" link: one link
                is enough on this section.
                Consequence, recorded rather than argued: the gated brief at
                /investors/brief and /api/v1/investors/onepager is reachable
                ONLY by knowing the URL. That is intentional: do not "fix" it by
                re-adding a button without asking. */}
            <span className="text-xs text-text-secondary/60 font-mono">1 page · open link</span>
          </div>
        </section>

        {/* ───── Pitch deck ───── */}
        <section>
          <p className="text-micro mb-3">
            {figures.deck.tag}
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">
            {figures.deck.title}
          </h2>

          {/* items-stretch so the preview column matches the index height rather
              than leaving a void under a single 16:9 thumbnail. */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-2 items-stretch">
            {/* Contents index — reads as a table of contents, not a paragraph blob */}
            <div className="lg:col-span-3 flex flex-col">
              <p className="text-micro mb-4">
                What&apos;s inside
              </p>
              <dl className="border-t border-border-subtle">
                {figures.deck.insideBullets.map((b) => (
                  <div key={b.label} className="grid grid-cols-1 sm:grid-cols-4 gap-x-4 gap-y-1 border-b border-border-subtle py-3">
                    <dt className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-amber sm:pt-0.5">
                      {b.label}
                    </dt>
                    <dd className="sm:col-span-3 text-[0.82rem] text-text-secondary leading-relaxed">
                      {b.body}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6 flex gap-3 flex-wrap items-center">
                <a
                  href="/api/v1/investors/deck"
                  download={figures.deck.pdfFilename}
                  /* border-transparent, not no border: the phone-version button
                     beside this one carries a 1px border, so without a matching
                     box this sits 2px shorter than its neighbour. */
                  className="inline-block rounded-none border border-transparent bg-amber px-5 py-2.5 text-xs font-mono uppercase tracking-wide text-background hover:bg-amber-light transition-colors"
                >
                  Download Full Briefing (PDF · {figures.deck.slideCount} slides)
                </a>
                {/* Same 14 topics at 405x720pt. Labelled "phone version" rather
                    than "mobile" because the reader is usually ON the phone they
                    got the email on — the label has to answer "which do I tap",
                    not describe a format. The landscape deck fits a ~390px screen
                    at 0.41x, which puts its body copy at 4-6pt. */}
                <a
                  href="/api/v1/investors/deck/mobile"
                  download="ambr-pitch-deck-mobile.pdf"
                  className="inline-block rounded-none border border-amber/50 px-5 py-2.5 text-xs font-mono uppercase tracking-wide text-amber hover:bg-amber/10 transition-colors"
                >
                  Phone version
                </a>
                <span className="text-xs text-text-secondary/60 font-mono">~1 MB</span>
              </div>
            </div>

            {/* Preview column — three slides rather than one, so the column fills
                the index's height honestly instead of cropping a 16:9 frame into
                a tall box. Cover / market / liquidity is the narrative spine. */}
            <div className="lg:col-span-2 flex flex-col gap-4 justify-between">
              {[
                { n: 1, caption: 'briefing cover' },
                { n: 6, caption: 'the curve · market' },
                { n: 13, caption: 'the ask · exit or hold' },
              ].map((s) => (
                <figure key={s.n} className="border border-amber/40 bg-surface overflow-hidden">
                  {/* The source PNG is 1280x720 but renders here ~370px wide, so
                      the deck's 10-15px body copy lands at 3-4px and is simply
                      unreadable. Link each preview to the full-size image (the
                      route stays gated, so this is not a bypass) and say so in
                      the caption — without the affordance they read as static
                      decoration, which is exactly the feedback we got. */}
                  <a
                    href={`/api/v1/investors/slide/${s.n}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open slide ${s.n} full size — ${s.caption}`}
                    className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-amber/70"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/v1/investors/slide/${s.n}`}
                      alt={`Ambr pitch deck · ${s.caption}`}
                      loading={s.n === 1 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="block w-full h-auto opacity-90 transition-opacity duration-200 group-hover:opacity-100"
                      width={1280}
                      height={720}
                    />
                  </a>
                  <figcaption className="flex items-center justify-between gap-2 px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-wider text-amber/70 border-t border-amber/20">
                    <span>{s.caption} · slide {s.n} / {figures.deck.slideCount}</span>
                    <span className="text-amber/50">enlarge ↗</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ───── Markets we serve ───── */}
        <section>
          <p className="text-micro mb-3">
            Markets we serve
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">
            Six verticals where agent-to-agent and agent-to-consumer commerce is already moving
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MarketCard
              label="Fintech + neobanks"
              summary="Embedded finance and AI-driven banking. Agents pay recurring subscriptions, utilities, and services on behalf of users."
              hook="Lower-cost A2A rails vs card networks; authorization-grade audit trail for autonomous spend."
            />
            <MarketCard
              label="E-commerce + SaaS"
              summary="Headless commerce, B2B SaaS, infra-as-a-service. Agents provision and renew subscriptions without human input."
              hook="Agent-first checkout · policy-bound spend limits · replayable proof of authorization."
            />
            <MarketCard
              label="Agentic-commerce platforms"
              summary="Multi-agent systems, AI-agent marketplaces, agent orchestrators. Agents transact with each other (A2A)."
              hook="Plug-in A2A rail · identity + consent + policy primitives · skip rolling your own payment stack."
            />
            <MarketCard
              label="Enterprise + B2B marketplaces"
              summary="Procurement, spend-management, regulated-sector SaaS. Agents negotiate and pay suppliers at scale."
              hook="Real-time A2A settlement · per-agent budgets and spend caps · audit-grade contract records."
            />
            <MarketCard
              label="Crypto + Web3 / DeFi"
              summary="Stablecoin rails, DAOs, institutional crypto, agent-native wallets. Programmable money + agent execution."
              hook="Ricardian contract bridge to L1/L2s · agents pay for compute, storage, oracle services autonomously."
            />
            <MarketCard
              label="Travel + subscription-heavy verticals"
              summary="Travel-tech, hospitality, subscription aggregators. Agents book and pay under user-defined rules."
              hook="Fine-grained consent + revocation · recurring Personal-tier flows · authorization legible to the merchant side."
            />
          </div>

          <p className="mt-6 text-xs text-text-secondary/60 leading-relaxed">
            Ambr is the Agent Mandate &amp; Binding Registry. It sits between an agent and a counterparty (consumer, merchant, or another agent) and turns &ldquo;the agent did this&rdquo; into a redeemable, replayable, auditable record. The verticals above are the surfaces where that record is most needed first.
          </p>
        </section>

        {/* ───── Financial highlights ───── */}
        <section>
          <p className="text-micro mb-3">
            {figures.model.tag}
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">
            {figures.model.title}
          </h2>

          {figures.model.scenarioNote && (
            <div className="border border-amber/40 bg-amber/5 p-5 mb-6">
              <p className="text-micro mb-2">
                Published floor · mapped upside
              </p>
              <p className="text-sm text-text-secondary leading-relaxed">
                {figures.model.scenarioNote}
              </p>
            </div>
          )}

          {figures.model.tiers && figures.model.tiers.length > 0 && (
            <div className="border border-amber/25 bg-surface/60 p-5 mb-6">
              <p className="text-micro mb-4">
                The scenario staircase · 2028 exit run-rate, and what unlocks each step
              </p>
              <div className="space-y-0">
                {figures.model.tiers.map((tier) => (
                  <div
                    key={tier.name}
                    className={`flex items-baseline justify-between gap-4 border-t py-3 ${
                      tier.published ? 'border-amber/60 bg-amber/5 px-3 -mx-3' : 'border-amber/15'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-micro">
                        {tier.name}
                        {tier.published && (
                          <span className="ml-2 border border-amber/50 px-1.5 py-0.5 text-[9px] text-amber">
                            THIS PAGE
                          </span>
                        )}
                        {tier.cashBasis && (
                          <span className="ml-2 border border-amber px-1.5 py-0.5 text-[9px] text-background bg-amber">
                            CASH-PLAN BASIS
                          </span>
                        )}
                        {tier.buffered && (
                          <span className="ml-2 border border-amber/40 px-1.5 py-0.5 text-[9px] text-amber/80">
                            CAPITALIZED BY THE FULL {figures.ask.round}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">{tier.driver}</p>
                    </div>
                    <p className="shrink-0 text-2xl text-text-primary font-serif">{tier.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <FinancialYearCard {...figures.model.years.y1} />
            <FinancialYearCard {...figures.model.years.y2} />
            <FinancialYearCard {...figures.model.years.y3} />
          </div>

          {figures.model.reconciliation2028 && (
            <p className="font-mono text-[11px] text-text-secondary/70 -mt-3 mb-6">
              {figures.model.reconciliation2028}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="border border-amber/40 bg-amber/5 p-5">
              <p className="text-micro mb-2">
                M36 Exit ARR
              </p>
              <p className="text-3xl text-text-primary font-serif">{figures.model.m36Arr}</p>
              <p className="text-xs text-text-secondary mt-1">year-3 exit run-rate</p>
            </div>
            <div className="border border-amber/30 bg-surface/80 p-5">
              <p className="text-micro mb-2">
                3-yr Cumulative Net Income
              </p>
              <p className="text-3xl text-text-primary font-serif">{figures.model.cumulativeNetIncome}</p>
            </div>
            <div className="border border-amber/30 bg-surface/80 p-5">
              <p className="text-micro mb-2">
                Peak Monthly Burn
              </p>
              <p className="text-3xl text-text-primary font-serif">{figures.model.peakBurn}</p>
              <p className="text-xs text-text-secondary mt-1">BASE scenario</p>
            </div>
          </div>

          {figures.model.cashflowNote && (
            <div className="border-2 border-amber bg-amber/10 p-5 mb-6">
              <p className="text-micro mb-2">
                ▲ Cash-flow basis · BASE, buffered to LOW
              </p>
              <p className="text-sm text-text-primary leading-relaxed">
                {figures.model.cashflowNote}
              </p>
            </div>
          )}

          <div className="border border-amber/20 bg-surface/50 p-4">
            <p className="text-xs text-text-secondary leading-relaxed">
              {figures.model.assumptions}
            </p>
          </div>

          {figures.deck.modelButtonLabel && (
            <div className="mt-5 flex items-center gap-3 flex-wrap">
              <a
                href="/api/v1/investors/model"
                download={figures.deck.modelFilename}
                className="inline-block rounded-none border border-amber/60 px-5 py-2.5 text-xs font-mono uppercase tracking-wide text-amber hover:bg-amber hover:text-background transition-colors"
              >
                {figures.deck.modelButtonLabel}
              </a>
              <span className="text-xs text-text-secondary/60 font-mono">
                full five-tier engine · Scenarios &amp; Ambition tabs
              </span>
            </div>
          )}
        </section>

        {/* ───── Pricing ───── */}
        <section>
          <p className="text-micro mb-3">
            Unit Economics
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">
            {figures.pricing.heading}
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {figures.pricing.tiers.map((t) => (
              <PricingCard key={t.tier} tier={t.tier} price={t.price} note={t.note} />
            ))}
          </div>
          <p className="mt-4 text-xs text-text-secondary/70">
            {figures.pricing.variableCostNote}
          </p>
        </section>

        {/* ───── Team ───── */}
        <section>
          <p className="text-micro mb-3">
            Team
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">
            Three founders, aligned equity
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {figures.team.map((m) => (
              <TeamCard key={m.name} name={m.name} role={m.role} detail={m.detail} />
            ))}
          </div>
        </section>

        {/* ───── What's live ───── */}
        <section>
          <p className="text-micro mb-3">
            Shipping Log
          </p>
          <h2 className="text-2xl text-text-primary font-serif mb-6">Recently deployed</h2>

          <ul className="space-y-3 text-sm text-text-secondary">
            {figures.deckLog.map((d) => (
              <li key={d.version}>
                <strong className="text-text-primary font-mono text-xs">{d.version} · {d.date}</strong> — {d.body}
              </li>
            ))}
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
          <p className="text-micro mb-3">
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
            Ambr is the Agent Mandate &amp; Binding Registry &mdash; infrastructure, not a law firm. Generated contracts are not legal advice.
          </p>
          <p className="text-micro text-amber/70">
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
      <p className="text-micro">{label}</p>
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
      <p className="text-micro mb-3">{label}</p>
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
      <p className="text-micro mb-2">{tier}</p>
      <p className="text-2xl font-serif text-text-primary">{price}</p>
      <p className="text-xs text-text-secondary/70 mt-1">{note}</p>
    </div>
  );
}

function TeamCard({ name, role, detail }: { name: string; role: string; detail: string }) {
  return (
    <div className="border border-amber/30 bg-surface/80 p-5">
      <p className="text-micro mb-2">{role}</p>
      <h3 className="text-lg text-text-primary font-serif mb-2">{name}</h3>
      <p className="text-xs text-text-secondary leading-relaxed">{detail}</p>
    </div>
  );
}

function MarketCard({ label, summary, hook }: { label: string; summary: string; hook: string }) {
  return (
    <div className="border border-amber/30 bg-surface/80 p-5">
      <p className="text-micro mb-3">{label}</p>
      <p className="text-sm text-text-primary leading-relaxed mb-3">{summary}</p>
      <p className="text-xs text-text-secondary/80 leading-relaxed italic">{hook}</p>
    </div>
  );
}
