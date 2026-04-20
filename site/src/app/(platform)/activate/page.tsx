'use client';

import { useState, useEffect, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'next/navigation';
import SectionWrapper from '@/components/ui/SectionWrapper';
import Button from '@/components/ui/Button';

interface AlphaFormData {
  email: string;
}

interface CryptoFormData {
  email: string;
  tx_hash: string;
  tier: 'startup' | 'scale' | 'enterprise';
}

interface StripeFormData {
  email: string;
  tier: 'startup' | 'scale' | 'enterprise';
}

const tiers = [
  { value: 'startup' as const, label: 'Starter Pack', price: '$49', credits: '200 contracts', overage: 'One-time — credits never expire' },
  { value: 'scale' as const, label: 'Scale Pack', price: '$199', credits: '1,000 contracts', overage: 'One-time — credits never expire' },
  { value: 'enterprise' as const, label: 'Enterprise', price: 'Custom', credits: 'Unlimited contracts', overage: 'Custom SLA + support' },
];

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
  const [tab, setTab] = useState<'developer' | 'crypto' | 'card'>('developer');
  const [status, setStatus] = useState<'idle' | 'loading' | 'polling' | 'success' | 'error'>('idle');
  const [apiKey, setApiKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const alphaForm = useForm<AlphaFormData>();
  const cryptoForm = useForm<CryptoFormData>({ defaultValues: { tier: 'startup' } });
  const stripeForm = useForm<StripeFormData>({ defaultValues: { tier: 'startup' } });

  // Handle Stripe return redirect
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const returnStatus = searchParams.get('status');

    if (sessionId && returnStatus === 'success') {
      setTab('card');
      setStatus('polling');
      pollStripeSession(sessionId);
    } else if (returnStatus === 'cancelled') {
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
          // Clean URL
          window.history.replaceState({}, '', '/activate');
          return;
        }

        if (data.status === 'already_retrieved') {
          setErrorMessage('This API key was already displayed and cannot be shown again. Check your records.');
          setStatus('error');
          window.history.replaceState({}, '', '/activate');
          return;
        }

        // Still pending — wait and retry
        await new Promise((r) => setTimeout(r, 2000));
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    setErrorMessage('Payment received but key generation is taking longer than expected. Please contact support.');
    setStatus('error');
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
      setApiKey(result.api_key);
      setStatus('success');
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

      // Redirect to Stripe
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
      <SectionWrapper>
        <div className="mx-auto max-w-lg relative">
          <div className="text-center mb-8">
            <p className="text-micro mb-2">
              Activate
            </p>
            <h1 className="text-3xl text-text-primary sm:text-4xl">
              Get Your API Key
            </h1>
            <p className="mt-4 text-[#aaa] text-sm font-light">
              Free developer tier — 25 contracts. Or pay per contract via x402.
            </p>
          </div>

          {status === 'success' ? (
            <div className="rounded-none border border-amber/60 bg-amber-glow relative p-6 text-center">
              <svg
                className="w-12 h-12 text-amber mx-auto mb-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h2 className="text-xl text-text-primary mb-2">
                Key Activated
              </h2>
              <p className="text-sm text-text-secondary mb-4">
                Save this key — it cannot be retrieved again.
              </p>
              <div className="rounded-none bg-surface border border-amber/40 p-3 mb-4">
                <code className="text-sm font-mono text-amber break-all select-all">
                  {apiKey}
                </code>
              </div>
              <button
                onClick={copyKey}
                className="rounded-none bg-amber px-4 py-2 text-sm font-mono uppercase tracking-wide text-xs text-background transition-colors hover:bg-amber-light"
              >
                {copied ? 'Copied' : 'Copy Key'}
              </button>
              <p className="mt-4 text-xs text-text-secondary">
                Use this key in the <code className="text-amber">X-API-Key</code> header
                when calling the contract API.{' '}
                <a href="/developers" className="text-amber hover:underline">
                  View docs
                </a>
              </p>
            </div>
          ) : status === 'polling' ? (
            <div className="rounded-none border border-amber/60 bg-amber-glow relative p-6 text-center">
              <div className="w-8 h-8 border-2 border-amber border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-text-secondary">
                Payment received. Generating your API key...
              </p>
            </div>
          ) : (
            <>
              {/* Tab switcher */}
              <div className="flex rounded-none border border-amber/60 bg-surface mb-6 p-1">
                <button
                  type="button"
                  onClick={() => { setTab('developer'); setStatus('idle'); setErrorMessage(''); }}
                  className={`flex-1 rounded-none py-2 text-sm font-mono uppercase tracking-wide text-xs transition-colors ${
                    tab === 'developer'
                      ? 'bg-amber text-background'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Developer
                </button>
                {stripeReady && <button
                  type="button"
                  onClick={() => { setTab('card'); setStatus('idle'); setErrorMessage(''); }}
                  className={`flex-1 rounded-none py-2 text-sm font-mono uppercase tracking-wide text-xs transition-colors ${
                    tab === 'card'
                      ? 'bg-amber text-background'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Card
                </button>}
                <button
                  type="button"
                  onClick={() => { setTab('crypto'); setStatus('idle'); setErrorMessage(''); }}
                  className={`flex-1 rounded-none py-2 text-sm font-mono uppercase tracking-wide text-xs transition-colors ${
                    tab === 'crypto'
                      ? 'bg-amber text-background'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Crypto
                </button>
              </div>

              {tab === 'developer' ? (
                <form onSubmit={alphaForm.handleSubmit(onAlphaSubmit)} className="space-y-5">
                  <div className="rounded-none border border-amber/60 bg-amber-glow relative p-4 text-center">
                    <p className="text-micro mb-1">Developer</p>
                    <p className="text-2xl font-serif text-text-primary">5 Free Contracts</p>
                    <p className="text-xs text-text-secondary mt-2">
                      Build and test integrations. One key per email. No payment required.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Email
                    </label>
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
                    <div className="rounded-none border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                      {errorMessage}
                    </div>
                  )}

                  <Button type="submit" disabled={isLoading} size="lg" className="w-full">
                    {isLoading ? 'Generating key...' : 'Claim Developer Key'}
                  </Button>

                  <p className="text-center text-xs text-text-secondary">
                    No wallet or payment required. Need more?{' '}
                    <button type="button" onClick={() => setTab('crypto')} className="text-amber hover:underline">
                      Buy a pack or pay per contract
                    </button>
                  </p>
                </form>
              ) : tab === 'card' && stripeReady ? (
                <form onSubmit={stripeForm.handleSubmit(onStripeSubmit)} className="space-y-5">
                  {/* Tier selection */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Tier
                    </label>
                    <div className="space-y-2">
                      {tiers.map((t) => (
                        <label
                          key={t.value}
                          className="flex items-center gap-3 glass-card rounded-lg p-3 cursor-pointer"
                        >
                          <input
                            type="radio"
                            value={t.value}
                            {...stripeForm.register('tier', { required: true })}
                            className="accent-amber"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-text-primary">{t.label}</span>
                              <span className="text-sm font-mono text-amber">{t.price}</span>
                            </div>
                            <p className="text-xs text-text-secondary mt-0.5">{t.credits}</p>
                            <p className="text-xs text-text-secondary/60">{t.overage}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Email
                    </label>
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
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                      {errorMessage}
                    </div>
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
                  {/* Wallet address */}
                  <div className="rounded-none border border-amber/60 bg-amber-glow relative p-4 text-center">
                    <p className="text-xs text-text-secondary mb-2">Send a supported token on Base to:</p>
                    <code className="text-sm font-mono text-text-primary select-all break-all">
                      {process.env.NEXT_PUBLIC_WALLET_ADDRESS}
                    </code>
                    <p className="text-xs text-text-secondary mt-2">
                      USDC, USDbC, DAI, ETH, WETH, cbETH, cbBTC
                    </p>
                  </div>

                  {/* Tier selection */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-2">
                      Tier
                    </label>
                    <div className="space-y-2">
                      {tiers.map((t) => (
                        <label
                          key={t.value}
                          className="flex items-center gap-3 glass-card rounded-lg p-3 cursor-pointer"
                        >
                          <input
                            type="radio"
                            value={t.value}
                            {...cryptoForm.register('tier', { required: true })}
                            className="accent-amber"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-text-primary">{t.label}</span>
                              <span className="text-sm font-mono text-amber">{t.price}</span>
                            </div>
                            <p className="text-xs text-text-secondary mt-0.5">{t.credits}</p>
                            <p className="text-xs text-text-secondary/60">{t.overage}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Email
                    </label>
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

                  {/* Transaction hash */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Base Transaction Hash
                    </label>
                    <input
                      type="text"
                      {...cryptoForm.register('tx_hash', {
                        required: 'Transaction hash is required',
                        pattern: {
                          value: /^0x[a-fA-F0-9]{64}$/,
                          message: 'Invalid transaction hash (must be 0x + 64 hex chars)',
                        },
                      })}
                      placeholder="0x..."
                      className="w-full rounded-none border border-amber/40 bg-surface px-4 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-amber focus:border-amber"
                    />
                    {cryptoForm.formState.errors.tx_hash && (
                      <p className="text-xs text-red-400 mt-1">{cryptoForm.formState.errors.tx_hash.message}</p>
                    )}
                  </div>

                  {status === 'error' && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                      {errorMessage}
                    </div>
                  )}

                  <Button type="submit" disabled={isLoading} size="lg" className="w-full">
                    {isLoading ? 'Verifying payment...' : 'Activate API Key'}
                  </Button>

                  <p className="text-center text-xs text-text-secondary">
                    Payment is verified on-chain — no manual review needed.
                  </p>
                </form>
              )}
            </>
          )}
        </div>
      </SectionWrapper>
    </main>
  );
}
