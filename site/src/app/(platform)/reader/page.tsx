'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SectionWrapper from '@/components/ui/SectionWrapper';
import Button from '@/components/ui/Button';

export default function ReaderSearchPage() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      router.push(`/reader/${trimmed}`);
    }
  }

  return (
    <main className="pt-20">
      <SectionWrapper>
        <div className="mx-auto max-w-xl text-center">
          <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
            Contract Reader
          </p>
          <h1 className="text-3xl font-bold text-text-primary sm:text-4xl mb-4">
            Verify Any Contract
          </h1>
          <p className="text-text-secondary text-sm mb-8">
            Enter a contract ID (amb-2026-0001), SHA-256 hash, or UUID to view
            and verify a Ricardian Contract.
          </p>

          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="amb-2026-0001 or SHA-256 hash..."
              className="flex-1 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-mono text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-amber focus:border-transparent"
            />
            <Button type="submit" size="lg">
              Look Up
            </Button>
          </form>

          <div className="mt-12 rounded-xl border border-border bg-surface p-6 text-left">
            <h2 className="text-sm font-semibold text-text-primary mb-3">
              How verification works
            </h2>
            <ol className="space-y-2 text-sm text-text-secondary">
              <li className="flex items-start gap-2">
                <span className="text-amber font-mono text-xs mt-0.5">01</span>
                The reader fetches the stored contract from the database
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber font-mono text-xs mt-0.5">02</span>
                It re-computes the SHA-256 hash of the human-readable + machine-readable content
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber font-mono text-xs mt-0.5">03</span>
                If the computed hash matches the stored hash, the contract is verified as untampered
              </li>
            </ol>
          </div>
        </div>
      </SectionWrapper>
    </main>
  );
}
