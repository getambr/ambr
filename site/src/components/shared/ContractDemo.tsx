'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sampleContract } from '@/lib/contract-sample';

type View = 'human' | 'machine';
type Variant = 'landing' | 'how-it-works';

interface ContractDemoProps {
  variant?: Variant;
}

export default function ContractDemo({ variant = 'landing' }: ContractDemoProps) {
  const [view, setView] = useState<View>('human');
  const isExpanded = variant === 'how-it-works';

  return (
    <div className="w-full">
      {/* Toggle tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-surface p-1 w-fit">
        <button
          onClick={() => setView('human')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            view === 'human'
              ? 'bg-amber text-background'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Human-Readable
        </button>
        <button
          onClick={() => setView('machine')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            view === 'machine'
              ? 'bg-amber text-background'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Machine-Parsable
        </button>
      </div>

      {/* Contract view */}
      <div className={`rounded-xl border border-border bg-surface overflow-hidden ${isExpanded ? '' : 'max-h-[420px]'}`}>
        <AnimatePresence mode="wait">
          {view === 'human' ? (
            <motion.div
              key="human"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="p-6 overflow-auto"
              style={isExpanded ? {} : { maxHeight: 420 }}
            >
              <pre className="font-mono text-sm leading-relaxed text-text-primary whitespace-pre-wrap">
                {sampleContract.humanReadable}
              </pre>
            </motion.div>
          ) : (
            <motion.div
              key="machine"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="p-6 overflow-auto"
              style={isExpanded ? {} : { maxHeight: 420 }}
            >
              <pre className="font-mono text-sm leading-relaxed text-text-primary whitespace-pre-wrap">
                {JSON.stringify(sampleContract.machineReadable, null, 2)}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* SHA-256 hash highlight */}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-glow border border-amber/20 px-4 py-2">
        <span className="text-xs font-medium text-amber">SHA-256</span>
        <code className="font-mono text-xs text-text-secondary break-all">
          {sampleContract.sha256Hash}
        </code>
      </div>

      {/* Principal Declaration */}
      <div className="mt-3 rounded-lg border border-border bg-surface-elevated px-4 py-3">
        <p className="text-xs font-medium text-amber mb-1">Principal Declaration</p>
        <p className="text-sm text-text-primary">
          Agent <code className="font-mono text-amber-light">{sampleContract.principalDeclaration.agentId}</code>{' '}
          acts on behalf of{' '}
          <span className="font-medium">{sampleContract.principalDeclaration.principalName}</span>{' '}
          <span className="text-text-secondary">({sampleContract.principalDeclaration.principalType})</span>
        </p>
      </div>

      {/* Amendment chain */}
      {isExpanded && (
        <div className="mt-4">
          <p className="text-xs font-medium text-text-secondary mb-3">Amendment Chain</p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            {sampleContract.amendmentChain.map((item, i) => (
              <div key={item.contractHash} className="flex items-center gap-2">
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    item.type === 'original'
                      ? 'border-amber bg-amber-glow text-amber'
                      : item.type === 'amendment'
                      ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  }`}
                >
                  <span className="font-medium">{item.label}</span>
                  <p className="font-mono text-[10px] mt-0.5 opacity-70">
                    {item.contractHash.slice(0, 12)}…
                  </p>
                </div>
                {i < sampleContract.amendmentChain.length - 1 && (
                  <span className="text-text-secondary hidden sm:block">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
