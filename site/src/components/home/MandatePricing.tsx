import Reveal from '@/components/ui/Reveal';
import { normalizeBaseUrl } from '@/lib/base-url';
import { FREE_TIER_CREDITS, PACKS, TEAM, ENTERPRISE, formatUsd } from '@/lib/pricing';

const serif = { fontFamily: 'var(--font-instrument-serif), serif' } as const;
const mono = { fontFamily: 'var(--font-jetbrains-mono), monospace' } as const;

const tiers = [
  { tier: 'consumer', label: 'Personal', fallback: '$0.20', note: 'a person authorizes their own AI agent' },
  { tier: 'delegation', label: 'Delegation', fallback: '$0.50', note: 'delegate authority to your agent, with spending caps' },
  { tier: 'commerce', label: 'Agent-to-agent', fallback: '$1.00', note: 'one agent commissions and pays another' },
  { tier: 'fleet', label: 'Fleet · Multi-agent', fallback: '$2.50', note: 'shared budgets & sub-delegation across a fleet' },
];

// Normalized: a dirty env value made this fetch fail silently, and `catch { return {} }`
// below meant the page fell back to the hardcoded prices instead of showing an error.
// The numbers happened to match, so nothing looked wrong for ~180 days.
const PRICING_URL = `${normalizeBaseUrl(process.env.NEXT_PUBLIC_MARKETING_URL, 'https://ambr.run')}/api/v1/pricing`;

async function getLivePrices(): Promise<Record<string, string>> {
  try {
    const res = await fetch(PRICING_URL, { next: { revalidate: 3600 } });
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<string, string> = {};
    for (const t of data?.tiers ?? []) if (t?.tier && t?.price_display) map[t.tier] = t.price_display;
    return map;
  } catch {
    return {};
  }
}

export default async function MandatePricing() {
  const live = await getLivePrices();
  return (
    <section className="relative px-6 py-28 sm:px-10 lg:px-16" style={{ background: '#0a0a0a', color: '#f4f4f0' }}>
      <div className="mx-auto max-w-[1500px]">
        <Reveal><div style={{ height: 1, background: 'linear-gradient(to right, rgba(198,168,124,0.45), transparent)' }} /></Reveal>
        <Reveal delay={0.05}>
          <p className="mt-6 text-[11px] uppercase" style={{ ...mono, color: '#c6a87c', letterSpacing: '0.3em' }}>§ 04 — Pricing</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-5 max-w-3xl" style={{ ...serif, fontSize: 'clamp(2.4rem, 5vw, 4.4rem)', lineHeight: 0.98, letterSpacing: '-0.02em' }}>
            Per contract. Credits are cents.
          </h2>
        </Reveal>

        <div className="mt-14">
          {tiers.map((t, i) => (
            <Reveal key={t.tier} delay={i * 0.08}>
              <div className="flex items-baseline justify-between gap-6 border-t py-7" style={{ borderColor: 'rgba(198,168,124,0.22)' }}>
                <div>
                  <div style={{ ...serif, fontSize: 'clamp(1.5rem, 2.6vw, 2.1rem)', color: '#f4f4f0' }}>{t.label}</div>
                  <div className="mt-1 text-[11px] uppercase" style={{ ...mono, color: '#8a8170', letterSpacing: '0.12em' }}>{t.note}</div>
                </div>
                <div className="shrink-0 text-right" style={{ ...serif, fontSize: 'clamp(1.8rem, 3.2vw, 2.6rem)', color: '#c6a87c' }}>
                  {live[t.tier] ?? t.fallback}
                </div>
              </div>
            </Reveal>
          ))}
          <Reveal delay={0.4}>
            <p className="mt-7 text-[11px] uppercase" style={{ ...mono, color: '#6f675b', letterSpacing: '0.14em' }}>
              Free tier: {FREE_TIER_CREDITS} credits once, per verified-email key · {PACKS.map((p) => `${p.label} ${formatUsd(p.price_cents)} = ${p.credits.toLocaleString('en-US')} credits`).join(' · ')} · {TEAM.label} {formatUsd(TEAM.price_cents_monthly)}/mo = {TEAM.credits_per_month.toLocaleString('en-US')} credits · {ENTERPRISE.label} {formatUsd(ENTERPRISE.price_cents_yearly)}/year · live rates at /api/v1/pricing
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
