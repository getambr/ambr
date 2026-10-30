'use client';

/**
 * /activate/reveal?token=…
 *
 * Terminal step of the verified key claim. Opening this page proves control of
 * the mailbox; the key is issued here and shown exactly once.
 *
 * When the address already holds an active key the page stops and asks first —
 * replacing a key is destructive and must never happen just because someone
 * opened the link.
 */

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import SectionWrapper from '@/components/ui/SectionWrapper';
import ScrollReveal from '@/components/ui/ScrollReveal';
import Button from '@/components/ui/Button';

type Phase = 'checking' | 'confirm_rotation' | 'issued' | 'error';

function RevealInner() {
  const token = useSearchParams().get('token') ?? '';
  const [phase, setPhase] = useState<Phase>('checking');
  const [apiKey, setApiKey] = useState('');
  const [existingPrefix, setExistingPrefix] = useState('');
  const [rotated, setRotated] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState(false);

  const redeem = useCallback(
    async (confirmRotation: boolean) => {
      setWorking(true);
      try {
        const res = await fetch('/api/v1/keys/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            confirmRotation ? { token, confirm_rotation: true } : { token },
          ),
        });
        const result = await res.json();

        if (!res.ok) {
          setErrorMessage(result.message || 'This link could not be used.');
          setPhase('error');
          return;
        }
        if (result.status === 'rotation_required') {
          setExistingPrefix(result.prefix ?? '');
          setPhase('confirm_rotation');
          return;
        }
        setApiKey(result.api_key);
        setRotated(Boolean(result.rotated));
        setPhase('issued');
      } catch {
        setErrorMessage('Network error. Please try again.');
        setPhase('error');
      } finally {
        setWorking(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      setErrorMessage('This link is missing its token. Request a new one.');
      setPhase('error');
      return;
    }
    redeem(false);
  }, [token, redeem]);

  function copyKey() {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SectionWrapper>
      <div className="mx-auto max-w-lg relative">
        {phase === 'checking' && (
          <div className="rounded-none border border-amber/60 bg-amber-glow relative p-6 text-center">
            <div className="w-8 h-8 border-2 border-amber border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-text-secondary">Verifying your link…</p>
          </div>
        )}

        {phase === 'confirm_rotation' && (
          <ScrollReveal>
            <div className="rounded-none border border-amber/60 bg-surface relative p-6 text-center">
              <p className="text-micro mb-2">Replace key</p>
              <h2 className="text-xl text-text-primary mb-3">This email already has an active key</h2>
              <p className="text-sm text-text-secondary mb-4">
                Continuing will issue a new key and immediately stop
                {existingPrefix ? (
                  <> <code className="text-amber">{existingPrefix}…</code> </>
                ) : (
                  ' your current key '
                )}
                from working. Any integration using it will start failing.
              </p>
              <p className="text-sm text-text-secondary mb-5">
                If you still have your key, close this page — nothing has changed yet.
              </p>
              <Button onClick={() => redeem(true)} disabled={working} size="lg" className="w-full">
                {working ? 'Replacing…' : 'Replace my key'}
              </Button>
            </div>
          </ScrollReveal>
        )}

        {phase === 'issued' && (
          <ScrollReveal>
            <div className="rounded-none border border-amber/60 bg-amber-glow relative p-6 text-center">
              <svg className="w-12 h-12 text-amber mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-xl text-text-primary mb-2">{rotated ? 'New Key Issued' : 'Key Activated'}</h2>
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
              {rotated && (
                <p className="mt-4 text-xs text-text-secondary">
                  Your previous key has been deactivated. Update anywhere it was in use.
                </p>
              )}
              <p className="mt-4 text-sm text-text-primary">
                Next: open the <a href="/dashboard" className="text-amber hover:underline">Dashboard</a> and
                choose &ldquo;Sign in with your API key&rdquo; — paste this key there.
              </p>
              <p className="mt-2 text-xs text-text-secondary">
                For API calls, send it in the <code className="text-amber">X-API-Key</code> header.{' '}
                <a href="/developers" className="text-amber hover:underline">View docs</a>
              </p>
            </div>
          </ScrollReveal>
        )}

        {phase === 'error' && (
          <ScrollReveal>
            <div className="rounded-none border border-red-500/30 bg-red-500/10 relative p-6 text-center">
              <h2 className="text-xl text-text-primary mb-2">Link unavailable</h2>
              <p className="text-sm text-red-400 mb-5">{errorMessage}</p>
              <p className="text-sm text-text-secondary mb-5">
                Links work once and expire after 30 minutes. Requesting a new one is free.
              </p>
              <Button href="/activate" size="lg" className="w-full">
                Request a new link
              </Button>
            </div>
          </ScrollReveal>
        )}
      </div>
    </SectionWrapper>
  );
}

export default function RevealPage() {
  return (
    <Suspense
      fallback={
        <SectionWrapper>
          <div className="mx-auto max-w-lg rounded-none border border-amber/60 bg-amber-glow p-6 text-center">
            <div className="w-8 h-8 border-2 border-amber border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        </SectionWrapper>
      }
    >
      <RevealInner />
    </Suspense>
  );
}
