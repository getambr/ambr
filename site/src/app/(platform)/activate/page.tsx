'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import SectionWrapper from '@/components/ui/SectionWrapper';
import Button from '@/components/ui/Button';

interface FormData {
  email: string;
  tx_hash: string;
  tier: 'starter' | 'builder' | 'enterprise';
}

const tiers = [
  { value: 'starter' as const, label: 'Starter — $29 USDC', credits: '50 contracts' },
  { value: 'builder' as const, label: 'Builder — $99 USDC', credits: '250 contracts' },
  { value: 'enterprise' as const, label: 'Enterprise — $299 USDC', credits: 'Unlimited' },
];

export default function ActivatePage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [apiKey, setApiKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ defaultValues: { tier: 'starter' } });

  async function onSubmit(data: FormData) {
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

  function copyKey() {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="pt-20">
      <SectionWrapper>
        <div className="mx-auto max-w-lg">
          <div className="text-center mb-8">
            <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
              Activate
            </p>
            <h1 className="text-3xl font-bold text-text-primary sm:text-4xl">
              Claim Your API Key
            </h1>
            <p className="mt-4 text-text-secondary text-sm">
              Send USDC on Base to the wallet below, then paste your transaction
              hash to receive your API key instantly.
            </p>
          </div>

          {/* Wallet address */}
          <div className="rounded-xl border border-amber/20 bg-amber-glow p-4 text-center mb-8">
            <p className="text-xs text-text-secondary mb-2">Send USDC on Base to:</p>
            <code className="text-sm font-mono text-text-primary select-all break-all">
              {process.env.NEXT_PUBLIC_WALLET_ADDRESS}
            </code>
          </div>

          {status === 'success' ? (
            <div className="rounded-xl border border-amber/30 bg-amber-glow p-6 text-center">
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
              <h2 className="text-xl font-bold text-text-primary mb-2">
                Key Activated
              </h2>
              <p className="text-sm text-text-secondary mb-4">
                Save this key — it cannot be retrieved again.
              </p>
              <div className="rounded-lg bg-surface border border-border p-3 mb-4">
                <code className="text-sm font-mono text-amber break-all select-all">
                  {apiKey}
                </code>
              </div>
              <button
                onClick={copyKey}
                className="rounded-lg bg-amber px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-amber-light"
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
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Tier selection */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Tier
                </label>
                <div className="space-y-2">
                  {tiers.map((t) => (
                    <label
                      key={t.value}
                      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 cursor-pointer hover:border-amber/30 transition-colors"
                    >
                      <input
                        type="radio"
                        value={t.value}
                        {...register('tier', { required: true })}
                        className="accent-amber"
                      />
                      <div>
                        <span className="text-sm font-medium text-text-primary">
                          {t.label}
                        </span>
                        <span className="text-xs text-text-secondary ml-2">
                          ({t.credits})
                        </span>
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
                  {...register('email', { required: 'Email is required' })}
                  placeholder="you@company.com"
                  className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-amber focus:border-transparent"
                />
                {errors.email && (
                  <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>
                )}
              </div>

              {/* Transaction hash */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Base Transaction Hash
                </label>
                <input
                  type="text"
                  {...register('tx_hash', {
                    required: 'Transaction hash is required',
                    pattern: {
                      value: /^0x[a-fA-F0-9]{64}$/,
                      message: 'Invalid transaction hash (must be 0x + 64 hex chars)',
                    },
                  })}
                  placeholder="0x..."
                  className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-amber focus:border-transparent"
                />
                {errors.tx_hash && (
                  <p className="text-xs text-red-400 mt-1">{errors.tx_hash.message}</p>
                )}
              </div>

              {/* Error message */}
              {status === 'error' && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {errorMessage}
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                disabled={status === 'loading'}
                size="lg"
                className="w-full"
              >
                {status === 'loading' ? 'Verifying payment...' : 'Activate API Key'}
              </Button>

              <p className="text-center text-xs text-text-secondary">
                Payment is verified on-chain — no manual review needed.
              </p>
            </form>
          )}
        </div>
      </SectionWrapper>
    </main>
  );
}
