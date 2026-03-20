'use client';

import { useState } from 'react';

type Intent = 'accept' | 'reject' | 'request_changes';
type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

interface Handshake {
  wallet_address: string;
  intent: string;
  message?: string;
  visibility_preference?: string;
  created_at: string;
}

interface HandshakeActionsProps {
  contractUuid: string;
  contractVisibility: string;
  walletAddress: string;
  handshakes: Handshake[];
  onHandshakeComplete: () => void;
}

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'metadata_only', label: 'Metadata Only' },
  { value: 'public', label: 'Public' },
  { value: 'encrypted', label: 'Encrypted' },
];

export default function HandshakeActions({
  contractUuid,
  contractVisibility,
  walletAddress,
  handshakes,
  onHandshakeComplete,
}: HandshakeActionsProps) {
  const [intent, setIntent] = useState<Intent | null>(null);
  const [message, setMessage] = useState('');
  const [visibility, setVisibility] = useState(contractVisibility);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string | null>(null);

  const existingHandshake = handshakes.find(
    (h) => h.wallet_address === walletAddress.toLowerCase(),
  );

  const acceptCount = handshakes.filter((h) => h.intent === 'accept').length;
  const hasMismatch = handshakes.some(
    (h) => h.intent === 'accept' && h.visibility_preference && h.visibility_preference !== contractVisibility,
  );

  const submit = async () => {
    if (!intent) return;
    setSubmitState('submitting');
    setError(null);

    try {
      const res = await fetch(`/api/v1/contracts/${contractUuid}/handshake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: walletAddress,
          intent,
          message: intent === 'request_changes' ? message : undefined,
          visibility_preference: visibility,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Handshake failed');

      setSubmitState('success');
      onHandshakeComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Handshake failed');
      setSubmitState('error');
    }
  };

  return (
    <div className="rounded-xl border border-amber-600/20 bg-stone-900/50 p-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-500">
        Handshake
      </h3>

      {/* Existing handshakes */}
      {handshakes.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-stone-500">Parties:</p>
          {handshakes.map((h) => (
            <div key={h.wallet_address} className="flex items-center gap-2 text-xs">
              <span className="font-mono text-stone-400">
                {h.wallet_address.slice(0, 6)}...{h.wallet_address.slice(-4)}
              </span>
              <span className={
                h.intent === 'accept' ? 'text-emerald-400' :
                h.intent === 'reject' ? 'text-red-400' : 'text-yellow-400'
              }>
                {h.intent}
              </span>
              {h.visibility_preference && (
                <span className="text-stone-600">vis: {h.visibility_preference}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Visibility agreement status */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-stone-500">Visibility:</span>
        <span className="text-xs text-stone-300">{contractVisibility}</span>
        {hasMismatch && (
          <span className="rounded-full bg-yellow-500/10 border border-yellow-500/30 px-2 py-0.5 text-[10px] text-yellow-400">
            mismatch
          </span>
        )}
        {!hasMismatch && acceptCount > 0 && (
          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-400">
            agreed
          </span>
        )}
      </div>

      {/* Action area */}
      <div className="mt-4">
        {submitState === 'success' ? (
          <p className="text-sm text-emerald-400">
            Handshake recorded.
            {existingHandshake ? ' Updated your previous response.' : ''}
          </p>
        ) : existingHandshake && submitState === 'idle' ? (
          <div className="space-y-2">
            <p className="text-xs text-stone-400">
              You responded: <span className="text-stone-300">{existingHandshake.intent}</span>
            </p>
            <button
              onClick={() => setIntent(null)}
              className="text-xs text-stone-500 underline hover:text-stone-400"
            >
              Change response
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Intent buttons */}
            <div className="flex gap-2">
              {(['accept', 'reject', 'request_changes'] as Intent[]).map((i) => (
                <button
                  key={i}
                  onClick={() => setIntent(i)}
                  disabled={submitState === 'submitting'}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    intent === i
                      ? i === 'accept'
                        ? 'bg-emerald-600 text-white'
                        : i === 'reject'
                          ? 'bg-red-600 text-white'
                          : 'bg-yellow-600 text-white'
                      : 'border border-stone-700 text-stone-400 hover:border-stone-500'
                  }`}
                >
                  {i === 'request_changes' ? 'Request Changes' : i.charAt(0).toUpperCase() + i.slice(1)}
                </button>
              ))}
            </div>

            {/* Message input for request_changes */}
            {intent === 'request_changes' && (
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe the changes you want..."
                className="w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:border-amber-500 focus:outline-none"
                rows={3}
              />
            )}

            {/* Visibility preference */}
            {intent && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-stone-500">Your visibility preference:</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="rounded border border-stone-700 bg-stone-800 px-2 py-1 text-xs text-stone-300 focus:border-amber-500 focus:outline-none"
                >
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Submit */}
            {intent && (
              <button
                onClick={submit}
                disabled={submitState === 'submitting'}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
              >
                {submitState === 'submitting' ? 'Submitting...' : 'Confirm Handshake'}
              </button>
            )}

            {submitState === 'error' && error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
