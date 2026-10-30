'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'next/navigation';
import SectionWrapper from '@/components/ui/SectionWrapper';
import Reveal from '@/components/ui/Reveal';
import AmbrCard from '@/components/ui/AmbrCard';
import Button from '@/components/ui/Button';
import Eyebrow from '@/components/ui/Eyebrow';
import { DISPLAY, EDITORIAL } from '@/lib/type';
import { FREE_TIER_CREDITS, PACKS, TEAM, ENTERPRISE, formatUsd } from '@/lib/pricing';

/* ─── Types ─── */

interface AlphaFormData { email: string }
interface CryptoFormData { email: string; tx_hash: string; tier: 'startup' | 'scale' | 'enterprise' }
interface StripeFormData { email: string; tier: 'startup' | 'scale' | 'enterprise' }

interface PricingTier {
  tier: string;
  label: string;
  price_cents: number;
  price_display: string;
  templates: { slug: string; name: string }[];
}

/* ─── Static data ─── */

const fmt = (n: number) => n.toLocaleString('en-US');

const userPlans = [
  {
    name: 'Developer',
    price: 'Free',
    period: '',
    contracts: `${fmt(FREE_TIER_CREDITS)} credits, once per verified key`,
    features: ['No renewal', 'No card required', 'Email support'],
    cta: 'Get Started',
    action: 'developer' as const,
    featured: false,
  },
  {
    name: TEAM.label,
    price: formatUsd(TEAM.price_cents_monthly),
    period: '/mo',
    contracts: `${fmt(TEAM.credits_per_month)} credits per paid invoice`,
    features: ['Unlimited AI chat', 'Team sharing', 'Counterparty portal', 'Priority support', 'Overage: buy a pack'],
    cta: 'Subscribe',
    action: 'subscribe' as const,
    plan: TEAM.slug,
    featured: true,
    badge: 'Popular',
  },
  {
    name: ENTERPRISE.label,
    price: `${formatUsd(ENTERPRISE.price_cents_yearly)}`,
    period: '/year',
    contracts: `${fmt(ENTERPRISE.credits)} credits`,
    features: [...ENTERPRISE.includes],
    cta: 'Contact Us',
    action: 'contact' as const,
    featured: false,
  },
];

const packTiers = [
  ...PACKS.map((p) => ({
    value: p.slug,
    label: p.label,
    price: formatUsd(p.price_cents),
    credits: `${fmt(p.credits)} credits`,
    effective: p.credits > p.price_cents ? `+${fmt(p.credits - p.price_cents)} bonus credits` : '1 credit = 1 cent',
    savings: p.slug === 'scale' ? 'Best value' : 'Pay per contract',
  })),
  { value: 'enterprise' as const, label: ENTERPRISE.label, price: `${formatUsd(ENTERPRISE.price_cents_yearly)}/yr`, credits: `${fmt(ENTERPRISE.credits)} credits`, effective: 'Contact us', savings: ENTERPRISE.includes.join(', ') },
];

/* ─── Page ─── */

export default function ActivatePage() {
  return (
    <Suspense fallback={
      <main className="pt-20">
        <SectionWrapper>
          <div className="mx-auto max-w-lg text-center">
            <div className="w-8 h-8 border-2 border-amber border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        </SectionWrapper>
      </main>
    }>
      <ActivateContent />
    </Suspense>
  );
}

function ActivateContent() {
  const searchParams = useSearchParams();
  const stripeTest = searchParams.get('stripe') === 'test';
  const stripeReady = stripeTest || (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_live_') ?? false);

  const [view, setView] = useState<'users' | 'developers'>('users');
  const [tab, setTab] = useState<'developer' | 'crypto' | 'card'>('developer');
  const [status, setStatus] = useState<'idle' | 'loading' | 'polling' | 'success' | 'sent' | 'error'>('idle');
  const [apiKey, setApiKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
  const [devPricing, setDevPricing] = useState<PricingTier[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<'business' | null>(null);
  const [subEmail, setSubEmail] = useState('');
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState('');

  const formRef = useRef<HTMLDivElement>(null);

  const alphaForm = useForm<AlphaFormData>();
  const cryptoForm = useForm<CryptoFormData>({ defaultValues: { tier: 'startup' } });
  const stripeForm = useForm<StripeFormData>({ defaultValues: { tier: 'startup' } });

  // Fetch live developer pricing
  useEffect(() => {
    fetch('/api/v1/pricing')
      .then((r) => r.json())
      .then((data) => { if (data.tiers) setDevPricing(data.tiers); })
      .catch(() => {});
  }, []);

  const [subscriptionSuccess, setSubscriptionSuccess] = useState(false);

  // Handle Stripe return redirect
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const returnStatus = searchParams.get('status');
    const returnType = searchParams.get('type');

    if (returnStatus === 'success' && returnType === 'subscription') {
      setView('users');
      setSubscriptionSuccess(true);
      setShowForm(true);
      window.history.replaceState({}, '', '/activate');
    } else if (sessionId && returnStatus === 'success') {
      setView('developers');
      setShowForm(true);
      setTab('card');
      setStatus('polling');
      pollStripeSession(sessionId);
    } else if (returnStatus === 'cancelled') {
      setView('developers');
      setShowForm(true);
      setTab('card');
      setErrorMessage('Payment was cancelled.');
      setStatus('error');
    }
  }, [searchParams]);

  async function pollStripeSession(sessionId: string) {
    const maxAttempts = 15;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(`/api/v1/stripe/session?session_id=${sessionId}`);
        const data = await res.json();
        if (data.status === 'fulfilled') {
          setApiKey(data.api_key);
          setStatus('success');
          window.history.replaceState({}, '', '/activate');
          return;
        }
        if (data.status === 'already_retrieved') {
          setErrorMessage('This API key was already displayed and cannot be shown again. Check your records.');
          setStatus('error');
          window.history.replaceState({}, '', '/activate');
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    setErrorMessage('Payment received but key generation is taking longer than expected. Please contact support.');
    setStatus('error');
  }

  function scrollToForm() {
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }

  async function onSubscriptionSubmit(plan: 'business', email: string) {
    setSubLoading(true);
    setSubError('');
    try {
      const res = await fetch('/api/v1/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkout_mode: 'subscription', plan, email }),
      });
      const result = await res.json();
      if (!res.ok) {
        setSubError(result.message || 'Failed to start checkout');
        setSubLoading(false);
        return;
      }
      window.location.href = result.url;
    } catch {
      setSubError('Network error. Please try again.');
      setSubLoading(false);
    }
  }

  async function onAlphaSubmit(data: AlphaFormData) {
    setStatus('loading');
    setErrorMessage('');
    try {
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, tier: 'developer' }),
      });
      const result = await res.json();
      if (!res.ok) {
        setErrorMessage(result.message || 'Activation failed');
        setStatus('error');
        return;
      }
      // The developer tier no longer returns a key here — it emails a
      // single-use link that verifies the address and then reveals the key at
      // /activate/reveal. The response is identical whether or not this email
      // is already registered, so this branch must not try to tell them apart.
      setStatus('sent');
    } catch {
      setErrorMessage('Network error. Please try again.');
      setStatus('error');
    }
  }

  async function onCryptoSubmit(data: CryptoFormData) {
    setStatus('loading');
    setErrorMessage('');
    try {
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) {
        setErrorMessage(result.message || 'Activation failed');
        setStatus('error');
        return;
      }
      setApiKey(result.api_key);
      setStatus('success');
    } catch {
      setErrorMessage('Network error. Please try again.');
      setStatus('error');
    }
  }

  async function onStripeSubmit(data: StripeFormData) {
    setStatus('loading');
    setErrorMessage('');
    try {
      const res = await fetch('/api/v1/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) {
        setErrorMessage(result.message || 'Failed to start checkout');
        setStatus('error');
        return;
      }
      window.location.href = result.url;
    } catch {
      setErrorMessage('Network error. Please try again.');
      setStatus('error');
    }
  }

  function copyKey() {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isLoading = status === 'loading' || status === 'polling';

  return (
    <main className="pt-20 section-dark relative">
      <div className="grid-bg grid-bg-dark" />

      {/* ─── SECTION 1: Hero ─── */}
      <SectionWrapper>
        <div className="text-center mb-12">
          <Reveal>
            <Eyebrow className="mb-4">§ 01 — Pricing</Eyebrow>
            <h1 style={DISPLAY.hero}>
              Simple, transparent<br />
              <span style={{ color: EDITORIAL.brass }}>pricing.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-text-secondary text-sm">
              Free to start. Scale as you grow. Pay per contract with credits, or subscribe to Team for monthly credits.
            </p>
          </Reveal>

          {/* Toggle */}
          <Reveal delay={0.1}>
            <div className="flex justify-center mt-8">
              <div className="inline-flex rounded-none border border-amber/60 bg-surface p-1">
                <button
                  type="button"
                  onClick={() => setView('users')}
                  className={`rounded-none px-5 py-2 text-sm font-mono uppercase tracking-wide text-xs transition-colors ${
                    view === 'users' ? 'bg-amber text-background' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  For Users
                </button>
                <button
                  type="button"
                  onClick={() => setView('developers')}
                  className={`rounded-none px-5 py-2 text-sm font-mono uppercase tracking-wide text-xs transition-colors ${
                    view === 'developers' ? 'bg-amber text-background' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  For Developers
                </button>
              </div>
            </div>
          </Reveal>
        </div>

        {/* ─── SECTION 2A: User Plans ─── */}
        {view === 'users' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {userPlans.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 0.08}>
                {plan.featured ? (
                  <AmbrCard geoPattern="ellipse" label={plan.name} meta={plan.badge} className="h-full">
                    <div className="py-4">
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-4xl brass-gradient-text font-serif">{plan.price}</span>
                        {plan.period && <span className="text-sm text-text-secondary">{plan.period}</span>}
                      </div>
                      <p className="text-sm text-amber mt-2">{plan.contracts}</p>
                      <ul className="mt-5 space-y-2 text-left">
                        {plan.features.map((f) => (
                          <li key={f} className="text-sm text-text-secondary flex items-start gap-2">
                            <span className="text-amber mt-0.5">+</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-6">
                        <Button
                          variant="primary"
                          size="md"
                          className="w-full"
                          onClick={() => {
                            if ('plan' in plan && plan.plan) {
                              setSelectedPlan(plan.plan as 'business');
                              setSubError('');
                              scrollToForm();
                            }
                          }}
                        >
                          {plan.cta}
                        </Button>
                      </div>
                    </div>
                  </AmbrCard>
                ) : (
                  <div className="border border-amber/60 bg-surface p-8 h-full flex flex-col relative">
                    <span className="text-micro">{plan.name}</span>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-3xl text-text-primary">{plan.price}</span>
                      {plan.period && <span className="text-sm text-text-secondary">{plan.period}</span>}
                    </div>
                    <p className="text-sm text-text-secondary mt-1">{plan.contracts}</p>
                    <ul className="mt-5 space-y-2 flex-1">
                      {plan.features.map((f) => (
                        <li key={f} className="text-sm text-text-secondary flex items-start gap-2">
                          <span className="text-amber mt-0.5">+</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-6">
                      {plan.action === 'developer' ? (
                        <Button
                          variant="secondary"
                          size="md"
                          className="w-full"
                          onClick={() => {
                            setView('developers');
                            setTab('developer');
                            scrollToForm();
                          }}
                        >
                          {plan.cta}
                        </Button>
                      ) : plan.action === 'contact' ? (
                        <Button variant="ghost" size="md" className="w-full" href="mailto:hello@ambr.run">
                          {plan.cta}
                        </Button>
                      ) : plan.action === 'subscribe' && 'plan' in plan && plan.plan ? (
                        <Button
                          variant="secondary"
                          size="md"
                          className="w-full"
                          onClick={() => {
                            setSelectedPlan(plan.plan as 'business');
                            setSubError('');
                            scrollToForm();
                          }}
                        >
                          {plan.cta}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )}
              </Reveal>
            ))}
          </div>
        )}

        {/* ─── SECTION 2B: Developer Plans ─── */}
        {view === 'developers' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {/* Free Developer Card */}
            <div className="border border-amber/60 bg-surface p-6 h-full flex flex-col">
              <span className="text-micro">Developer</span>
              <h3 className="text-3xl text-text-primary mt-2">Free</h3>
              <p className="text-xs text-text-secondary mt-1">{fmt(FREE_TIER_CREDITS)} credits, once</p>
              <p className="text-sm text-text-secondary mt-4 leading-relaxed flex-1">
                Build and test integrations. One key per email. No payment required.
              </p>
              <div className="mt-4">
                <Button variant="secondary" size="sm" className="w-full" onClick={() => { setTab('developer'); scrollToForm(); }}>
                  Claim Key
                </Button>
              </div>
            </div>

            {/* Per-contract pricing from API — prices live, labels/descriptions
                mapped locally to the on-pitch authority taxonomy (mirrors
                MandatePricing on the homepage; template names deliberately
                not enumerated on this purchase surface). */}
            {devPricing.map((tier) => {
              const display = ({
                consumer: { label: 'Personal', note: 'A person authorizes their own AI agent' },
                delegation: { label: 'Delegation', note: 'Delegate authority to your agent, with spending caps' },
                commerce: { label: 'Agent-to-agent', note: 'One agent commissions and pays another' },
                fleet: { label: 'Fleet · Multi-agent', note: 'Shared budgets & sub-delegation across a fleet' },
              } as Record<string, { label: string; note: string }>)[tier.tier] ?? { label: tier.label, note: '' };
              return (
                <div key={tier.tier} className="border border-amber/60 bg-surface p-6 h-full flex flex-col">
                  <span className="text-micro">{display.label}</span>
                  <h3 className="text-3xl text-text-primary mt-2">{tier.price_display}</h3>
                  <p className="text-xs text-text-secondary mt-1">per contract</p>
                  <p className="mt-4 text-sm text-text-secondary leading-relaxed flex-1">{display.note}</p>
                  <div className="mt-4">
                    <Button variant="secondary" size="sm" className="w-full" onClick={() => { setTab('crypto'); scrollToForm(); }}>
                      Pay per contract
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Fallback if API hasn't loaded */}
            {devPricing.length === 0 && (
              <>
                {[
                  { label: 'Personal', price: '$0.20' },
                  { label: 'Delegation', price: '$0.50' },
                  { label: 'Agent-to-agent', price: '$1.00' },
                  { label: 'Fleet · Multi-agent', price: '$2.50' },
                ].map((tier) => (
                  <div key={tier.label} className="border border-amber/60 bg-surface p-6 h-full flex flex-col">
                    <span className="text-micro">{tier.label}</span>
                    <h3 className="text-3xl text-text-primary mt-2">{tier.price}</h3>
                    <p className="text-xs text-text-secondary mt-1">per contract</p>
                    <div className="mt-4 flex-1" />
                    <Button variant="secondary" size="sm" className="w-full" onClick={() => { setTab('crypto'); scrollToForm(); }}>
                      Pay per contract
                    </Button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </SectionWrapper>

      {/* ─── SECTION 3: Credit Packs ─── */}
      {view === 'developers' && (
        <SectionWrapper>
          <Reveal>
            <div className="text-center mb-8">
              <Eyebrow className="mb-4">§ 02 — Credit Packs</Eyebrow>
              <h2 style={DISPLAY.section}>Buy in bulk</h2>
              <p className="mt-2 text-text-secondary text-sm">
                Credits never expire. Use across any contract type.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 max-w-3xl mx-auto">
            {packTiers.map((pack, i) => (
              <Reveal key={pack.value} delay={i * 0.08}>
                <div className="border border-amber/60 bg-surface p-6 h-full flex flex-col relative">
                  {/* Corner dots */}
                  <div className="absolute top-2 left-2 w-1.5 h-1.5 bg-amber" />
                  <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-amber" />
                  <div className="absolute bottom-2 left-2 w-1.5 h-1.5 bg-amber" />
                  <div className="absolute bottom-2 right-2 w-1.5 h-1.5 bg-amber" />

                  <span className="text-micro">{pack.label}</span>
                  <h3 className="text-3xl text-text-primary mt-2">{pack.price}</h3>
                  <p className="text-sm text-text-secondary mt-1">{pack.credits}</p>
                  <p className="text-xs text-amber mt-2">{pack.effective}</p>
                  <p className="text-xs text-text-secondary mt-1">{pack.savings}</p>
                  <div className="mt-4 flex gap-2">
                    {stripeReady && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        onClick={() => { setTab('card'); stripeForm.setValue('tier', pack.value); scrollToForm(); }}
                      >
                        Card
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => { setTab('crypto'); cryptoForm.setValue('tier', pack.value); scrollToForm(); }}
                    >
                      Crypto
                    </Button>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </SectionWrapper>
      )}

      {/* ─── SECTION 4: Founder Program Banner ─── */}
      <SectionWrapper>
        <Reveal>
          <div className="border border-amber/60 bg-amber-glow p-8 text-center max-w-2xl mx-auto relative">
            <div className="absolute top-2 left-2 w-1.5 h-1.5 bg-amber" />
            <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-amber" />
            <div className="absolute bottom-2 left-2 w-1.5 h-1.5 bg-amber" />
            <div className="absolute bottom-2 right-2 w-1.5 h-1.5 bg-amber" />

            <Eyebrow className="mb-4">§ 03 — Founding Partner Program</Eyebrow>
            <h3 className="text-xl text-text-primary sm:text-2xl">
              10 spots — 1,000 free contracts + 50% off forever
            </h3>
            <p className="text-sm text-text-secondary mt-2">
              Early adopters get lifetime pricing. Limited to the first 10 organizations.
            </p>
            <div className="mt-6">
              <Button href="/founders" variant="primary">
                Apply Now
              </Button>
            </div>
          </div>
        </Reveal>
      </SectionWrapper>

      {/* ─── SECTION 5: Activation Form ─── */}
      <div ref={formRef}>
        {showForm && (
          <SectionWrapper>
            <div className="mx-auto max-w-lg relative">

              {subscriptionSuccess ? (
                <Reveal>
                  <div className="rounded-none border border-amber/60 bg-amber-glow relative p-6 text-center">
                    <svg className="w-12 h-12 text-amber mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h2 className="text-xl text-text-primary mb-2">Subscription Active</h2>
                    <p className="text-sm text-text-secondary mb-4">
                      Your subscription is being set up. Stripe will email your receipt.
                    </p>
                    <p className="text-xs text-text-secondary">
                      Manage your subscription anytime from your{' '}
                      <a href="/dashboard" className="text-amber hover:underline">dashboard</a>.
                    </p>
                  </div>
                </Reveal>
              ) : status === 'sent' ? (
                <Reveal>
                  <div className="rounded-none border border-amber/60 bg-amber-glow relative p-6 text-center">
                    <svg className="w-12 h-12 text-amber mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                    <h2 className="text-xl text-text-primary mb-2">Check your email</h2>
                    <p className="text-sm text-text-secondary mb-4">
                      We sent a link that verifies your address and reveals your API key.
                      It works once and expires in 30 minutes.
                    </p>
                    <p className="text-xs text-text-secondary">
                      Already had a key? The link will replace it — your current one keeps
                      working until you confirm.
                    </p>
                  </div>
                </Reveal>
              ) : status === 'success' ? (
                <Reveal>
                  <div className="rounded-none border border-amber/60 bg-amber-glow relative p-6 text-center">
                    <svg className="w-12 h-12 text-amber mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h2 className="text-xl text-text-primary mb-2">Key Activated</h2>
                    <p className="text-sm text-text-secondary mb-4">Save this key — it cannot be retrieved again.</p>
                    <div className="rounded-none bg-surface border border-amber/40 p-3 mb-4">
                      <code className="text-sm font-mono text-amber break-all select-all">{apiKey}</code>
                    </div>
                    <button
                      onClick={copyKey}
                      className="rounded-none bg-amber px-4 py-2 text-sm font-mono uppercase tracking-wide text-xs text-background transition-colors hover:bg-amber-light"
                    >
                      {copied ? 'Copied' : 'Copy Key'}
                    </button>
                    <p className="mt-4 text-sm text-text-primary">
                      Next: open the <a href="/dashboard" className="text-amber hover:underline">Dashboard</a> and
                      choose &ldquo;Sign in with your API key&rdquo; — paste this key there.
                    </p>
                    <p className="mt-2 text-xs text-text-secondary">
                      For API calls, send it in the <code className="text-amber">X-API-Key</code> header.{' '}
                      <a href="/developers" className="text-amber hover:underline">View docs</a>
                    </p>
                  </div>
                </Reveal>
              ) : status === 'polling' ? (
                <div className="rounded-none border border-amber/60 bg-amber-glow relative p-6 text-center">
                  <div className="w-8 h-8 border-2 border-amber border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-sm text-text-secondary">Payment received. Generating your API key...</p>
                </div>
              ) : view === 'users' && selectedPlan ? (
                /* Subscription checkout form */
                <Reveal>
                  <div className="rounded-none border border-amber/60 bg-surface p-6">
                    <div className="text-center mb-6">
                      <Eyebrow className="mb-4">§ — Subscribe</Eyebrow>
                      <h3 className="text-xl text-text-primary mb-1">
                        {TEAM.label} Plan
                      </h3>
                      <p className="text-2xl font-serif text-amber">
                        {formatUsd(TEAM.price_cents_monthly)}
                        <span className="text-sm text-text-secondary">/mo</span>
                      </p>
                      <p className="text-xs text-text-secondary mt-2">
                        {fmt(TEAM.credits_per_month)} credits per paid invoice · Unlimited AI chat
                      </p>
                    </div>
                    <div className="space-y-4 max-w-sm mx-auto">
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
                        <input
                          type="email"
                          value={subEmail}
                          onChange={(e) => setSubEmail(e.target.value)}
                          placeholder="you@company.com"
                          className="w-full rounded-none border border-amber/40 bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-amber focus:border-amber"
                        />
                      </div>
                      {subError && (
                        <div className="rounded-none border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{subError}</div>
                      )}
                      <Button
                        variant="primary"
                        size="lg"
                        className="w-full"
                        disabled={subLoading || !subEmail}
                        onClick={() => subEmail && onSubscriptionSubmit(selectedPlan, subEmail)}
                      >
                        {subLoading ? 'Redirecting to checkout...' : `Subscribe — ${formatUsd(TEAM.price_cents_monthly)}/mo`}
                      </Button>
                      <p className="text-center text-xs text-text-secondary">
                        Secure checkout powered by Stripe. Cancel anytime.
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedPlan(null)}
                        className="block mx-auto text-xs text-text-secondary hover:text-text-primary underline"
                      >
                        ← Back to plans
                      </button>
                    </div>
                  </div>
                </Reveal>
              ) : (
                /* Developer activation forms */
                <Reveal>
                  <div className="text-center mb-6">
                    <Eyebrow className="mb-4">§ — Activate</Eyebrow>
                    <h2 className="text-2xl text-text-primary">Get Your API Key</h2>
                  </div>

                  {/* Tab switcher */}
                  <div className="flex rounded-none border border-amber/60 bg-surface mb-6 p-1">
                    <button
                      type="button"
                      onClick={() => { setTab('developer'); setStatus('idle'); setErrorMessage(''); }}
                      className={`flex-1 rounded-none py-2 text-sm font-mono uppercase tracking-wide text-xs transition-colors ${
                        tab === 'developer' ? 'bg-amber text-background' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      Developer
                    </button>
                    {stripeReady && (
                      <button
                        type="button"
                        onClick={() => { setTab('card'); setStatus('idle'); setErrorMessage(''); }}
                        className={`flex-1 rounded-none py-2 text-sm font-mono uppercase tracking-wide text-xs transition-colors ${
                          tab === 'card' ? 'bg-amber text-background' : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        Card
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setTab('crypto'); setStatus('idle'); setErrorMessage(''); }}
                      className={`flex-1 rounded-none py-2 text-sm font-mono uppercase tracking-wide text-xs transition-colors ${
                        tab === 'crypto' ? 'bg-amber text-background' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      Crypto
                    </button>
                  </div>

                  {tab === 'developer' ? (
                    <form onSubmit={alphaForm.handleSubmit(onAlphaSubmit)} className="space-y-5">
                      <div className="rounded-none border border-amber/60 bg-amber-glow relative p-4 text-center">
                        <p className="text-micro mb-1">Developer</p>
                        <p className="text-2xl font-serif text-text-primary">{fmt(FREE_TIER_CREDITS)} Free Credits</p>
                        <p className="text-xs text-text-secondary mt-2">
                          Build and test integrations. One key per verified email. No payment required.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
                        <input
                          type="email"
                          {...alphaForm.register('email', { required: 'Email is required' })}
                          placeholder="you@company.com"
                          className="w-full rounded-none border border-amber/40 bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-amber focus:border-amber"
                        />
                        {alphaForm.formState.errors.email && (
                          <p className="text-xs text-red-400 mt-1">{alphaForm.formState.errors.email.message}</p>
                        )}
                      </div>
                      {status === 'error' && (
                        <div className="rounded-none border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{errorMessage}</div>
                      )}
                      <Button type="submit" disabled={isLoading} size="lg" className="w-full">
                        {isLoading ? 'Sending link...' : 'Claim Developer Key'}
                      </Button>
                    </form>
                  ) : tab === 'card' && stripeReady ? (
                    <form onSubmit={stripeForm.handleSubmit(onStripeSubmit)} className="space-y-5">
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">Tier</label>
                        <div className="space-y-2">
                          {packTiers.map((t) => (
                            <label key={t.value} className="flex items-center gap-3 border border-amber/30 bg-surface p-3 cursor-pointer hover:border-amber/60 transition-colors">
                              <input type="radio" value={t.value} {...stripeForm.register('tier', { required: true })} className="accent-amber" />
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-text-primary">{t.label}</span>
                                  <span className="text-sm font-mono text-amber">{t.price}</span>
                                </div>
                                <p className="text-xs text-text-secondary mt-0.5">{t.credits}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
                        <input
                          type="email"
                          {...stripeForm.register('email', { required: 'Email is required' })}
                          placeholder="you@company.com"
                          className="w-full rounded-none border border-amber/40 bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-amber focus:border-amber"
                        />
                        {stripeForm.formState.errors.email && (
                          <p className="text-xs text-red-400 mt-1">{stripeForm.formState.errors.email.message}</p>
                        )}
                      </div>
                      {status === 'error' && (
                        <div className="rounded-none border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{errorMessage}</div>
                      )}
                      <Button type="submit" disabled={isLoading} size="lg" className="w-full">
                        {isLoading ? 'Redirecting to checkout...' : 'Pay with Card'}
                      </Button>
                      <p className="text-center text-xs text-text-secondary">
                        Secure checkout powered by Stripe. Your API key is delivered instantly after payment.
                      </p>
                    </form>
                  ) : (
                    <form onSubmit={cryptoForm.handleSubmit(onCryptoSubmit)} className="space-y-5">
                      <div className="rounded-none border border-amber/60 bg-amber-glow relative p-4 text-center">
                        <p className="text-xs text-text-secondary mb-2">Send a supported token on Base to:</p>
                        <code className="text-sm font-mono text-text-primary select-all break-all">
                          {process.env.NEXT_PUBLIC_WALLET_ADDRESS}
                        </code>
                        <p className="text-xs text-text-secondary mt-2">USDC, USDbC, DAI, ETH, WETH, cbETH, cbBTC</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">Tier</label>
                        <div className="space-y-2">
                          {packTiers.map((t) => (
                            <label key={t.value} className="flex items-center gap-3 border border-amber/30 bg-surface p-3 cursor-pointer hover:border-amber/60 transition-colors">
                              <input type="radio" value={t.value} {...cryptoForm.register('tier', { required: true })} className="accent-amber" />
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-text-primary">{t.label}</span>
                                  <span className="text-sm font-mono text-amber">{t.price}</span>
                                </div>
                                <p className="text-xs text-text-secondary mt-0.5">{t.credits}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
                        <input
                          type="email"
                          {...cryptoForm.register('email', { required: 'Email is required' })}
                          placeholder="you@company.com"
                          className="w-full rounded-none border border-amber/40 bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-amber focus:border-amber"
                        />
                        {cryptoForm.formState.errors.email && (
                          <p className="text-xs text-red-400 mt-1">{cryptoForm.formState.errors.email.message}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">Base Transaction Hash</label>
                        <input
                          type="text"
                          {...cryptoForm.register('tx_hash', {
                            required: 'Transaction hash is required',
                            pattern: { value: /^0x[a-fA-F0-9]{64}$/, message: 'Invalid transaction hash (must be 0x + 64 hex chars)' },
                          })}
                          placeholder="0x..."
                          className="w-full rounded-none border border-amber/40 bg-surface px-4 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-amber focus:border-amber"
                        />
                        {cryptoForm.formState.errors.tx_hash && (
                          <p className="text-xs text-red-400 mt-1">{cryptoForm.formState.errors.tx_hash.message}</p>
                        )}
                      </div>
                      {status === 'error' && (
                        <div className="rounded-none border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{errorMessage}</div>
                      )}
                      <Button type="submit" disabled={isLoading} size="lg" className="w-full">
                        {isLoading ? 'Verifying payment...' : 'Activate API Key'}
                      </Button>
                      <p className="text-center text-xs text-text-secondary">
                        Payment is verified on-chain — no manual review needed.
                      </p>
                    </form>
                  )}
                </Reveal>
              )}
            </div>
          </SectionWrapper>
        )}
      </div>
    </main>
  );
}
