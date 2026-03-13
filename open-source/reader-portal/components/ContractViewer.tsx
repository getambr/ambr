'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type View = 'human' | 'machine';

interface ContractViewerProps {
  humanReadable: string;
  machineReadable: Record<string, unknown>;
}

/**
 * Toggle between human-readable legal text and machine-parsable JSON.
 * Uses Framer Motion for smooth transitions.
 */
export default function ContractViewer({
  humanReadable,
  machineReadable,
}: ContractViewerProps) {
  const [view, setView] = useState<View>('human');

  return (
    <div>
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

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <AnimatePresence mode="wait">
          {view === 'human' ? (
            <motion.div
              key="human"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="p-6 overflow-auto"
            >
              <pre className="font-mono text-sm leading-relaxed text-text-primary whitespace-pre-wrap">
                {humanReadable}
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
            >
              <pre className="font-mono text-sm leading-relaxed text-text-primary whitespace-pre-wrap">
                {JSON.stringify(machineReadable, null, 2)}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
