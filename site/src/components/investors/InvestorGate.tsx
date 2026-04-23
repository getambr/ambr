'use client';

import { useState } from 'react';

export default function InvestorGate() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');

    const form = e.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password') || '');

    try {
      const res = await fetch('/api/v1/investors/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = await res.json();
      if (!res.ok) {
        setErrorMessage(result.message || 'Invalid password');
        setStatus('error');
        return;
      }
      // Success — reload to render the authenticated content server-side
      window.location.href = '/investors';
    } catch {
      setErrorMessage('Network error. Please try again.');
      setStatus('error');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-amber mb-3">
            Investor Access
          </p>
          <h1 className="text-3xl text-text-primary font-serif mb-3">
            Ambr · Confidential
          </h1>
          <p className="text-sm text-text-secondary">
            Password required. Provided with the pitch deck.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 border border-amber/40 bg-surface/80 p-6">
          <div>
            <label htmlFor="investor-password" className="block text-sm text-text-primary mb-2">
              Password
            </label>
            <input
              id="investor-password"
              name="password"
              type="password"
              required
              autoFocus
              autoComplete="off"
              placeholder="enter access password"
              className="w-full rounded-none border border-amber/40 bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-amber focus:border-amber"
            />
          </div>

          {status === 'error' && (
            <div className="rounded-none border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full rounded-none bg-amber px-4 py-3 text-sm font-mono uppercase tracking-wide text-xs text-background transition-colors hover:bg-amber-light disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status === 'submitting' ? 'Verifying...' : 'Access Package'}
          </button>

          <p className="text-xs text-text-secondary/60 text-center pt-2">
            No password? Contact{' '}
            <a href="mailto:dainis@ambr.run" className="text-amber hover:underline">
              dainis@ambr.run
            </a>
          </p>
        </form>

        <div className="text-center mt-6">
          <a
            href="/"
            className="font-mono text-xs text-text-secondary/60 hover:text-amber transition-colors"
          >
            ← back to ambr.run
          </a>
        </div>
      </div>
    </main>
  );
}
