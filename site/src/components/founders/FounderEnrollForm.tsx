'use client';

import { useState } from 'react';

export default function FounderEnrollForm() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');

    const form = e.currentTarget;
    const data = new FormData(form);
    const body = {
      email: String(data.get('email') || ''),
      org_name: String(data.get('org_name') || ''),
      contact_name: String(data.get('contact_name') || ''),
      use_case: String(data.get('use_case') || ''),
      wallet_address: String(data.get('wallet_address') || '') || undefined,
    };

    try {
      const res = await fetch('/api/v1/founders/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) {
        setErrorMessage(result.message || 'Submission failed');
        setStatus('error');
        return;
      }
      setStatus('success');
      form.reset();
    } catch {
      setErrorMessage('Network error. Please try again.');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-none border border-amber/60 bg-amber-glow p-5 text-center">
        <h3 className="text-base text-text-primary mb-2">Application Received</h3>
        <p className="text-sm text-text-secondary">
          We&apos;ll review and get back to you within 48 hours. Keep building.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-text-primary mb-1">
          Organization name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          name="org_name"
          required
          placeholder="Acme AI"
          className="w-full rounded-none border border-amber/40 bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-amber focus:border-amber"
        />
      </div>
      <div>
        <label className="block text-sm text-text-primary mb-1">
          Contact name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          name="contact_name"
          required
          placeholder="Your name"
          className="w-full rounded-none border border-amber/40 bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-amber focus:border-amber"
        />
      </div>
      <div>
        <label className="block text-sm text-text-primary mb-1">
          Email <span className="text-red-400">*</span>
        </label>
        <input
          type="email"
          name="email"
          required
          placeholder="you@company.com"
          className="w-full rounded-none border border-amber/40 bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-amber focus:border-amber"
        />
      </div>
      <div>
        <label className="block text-sm text-text-primary mb-1">
          EVM wallet address <span className="text-text-secondary/60">(optional — Base L2)</span>
        </label>
        <input
          type="text"
          name="wallet_address"
          placeholder="0x..."
          pattern="^(0x)?[a-fA-F0-9]{40}$"
          className="w-full rounded-none border border-amber/40 bg-surface px-4 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-amber focus:border-amber"
        />
      </div>
      <div>
        <label className="block text-sm text-text-primary mb-1">
          Use case <span className="text-red-400">*</span>
        </label>
        <textarea
          name="use_case"
          required
          rows={4}
          placeholder="What agent or platform are you building? What will you use Ambr for?"
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
        {status === 'submitting' ? 'Submitting...' : 'Apply'}
      </button>

      <p className="text-xs text-text-secondary/60 text-center">
        Only 10 spots available. Applications reviewed manually within 48 hours.
      </p>
    </form>
  );
}
