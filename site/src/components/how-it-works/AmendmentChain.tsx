'use client';

import { motion, useReducedMotion } from 'framer-motion';

const chainExamples = [
  {
    type: 'original' as const,
    label: 'Master SLA',
    hash: 'a1b2c3…',
    description: 'Original compute service agreement between Deployment Agent and Infrastructure Provider.',
  },
  {
    type: 'amendment' as const,
    label: 'Rate Increase',
    hash: 'd4e5f6…',
    description: 'Amendment increasing rate limit from 10K to 20K requests/day. References parent hash.',
  },
  {
    type: 'child' as const,
    label: 'Task Sub-Agreement',
    hash: 'g7h8i9…',
    description: 'Per-task sub-agreement spawned from master SLA for a specific GPU compute job.',
  },
  {
    type: 'extension' as const,
    label: '6-Month Extension',
    hash: 'j0k1l2…',
    description: 'Contract extension linked to the original via parent_contract_hash.',
  },
];

const typeStyles = {
  original: { border: 'border-amber/30', bg: 'bg-amber-glow', text: 'text-amber', badge: 'Original' },
  amendment: { border: 'border-blue-500/30', bg: 'bg-blue-500/10', text: 'text-blue-400', badge: 'Amendment' },
  child: { border: 'border-violet-500/30', bg: 'bg-violet-500/10', text: 'text-violet-400', badge: 'Child' },
  extension: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-400', badge: 'Extension' },
};

export default function AmendmentChain() {
  const prefersReduced = useReducedMotion();

  return (
    <div>
      <h3 className="text-2xl font-bold text-text-primary mb-2">
        Amendment Chains & Composability
      </h3>
      <p className="text-text-secondary mb-8 max-w-2xl">
        Contracts evolve over time. Amendments reference the
        original via <code className="font-mono text-amber text-sm">parent_contract_hash</code>,
        creating a linked chain with full audit trail.
      </p>

      <div className="space-y-3">
        {chainExamples.map((item, i) => {
          const style = typeStyles[item.type];
          return (
            <motion.div
              key={item.hash}
              initial={prefersReduced ? {} : { opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.1 }}
              className={`rounded-xl border ${style.border} ${style.bg} p-5 flex flex-col sm:flex-row sm:items-center gap-4`}
            >
              <div className="flex items-center gap-3 shrink-0">
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${style.text} ${style.bg}`}>
                  {style.badge}
                </span>
                <code className="font-mono text-xs text-text-secondary">{item.hash}</code>
              </div>
              <div className="flex-1">
                <h4 className={`text-sm font-semibold ${style.text}`}>{item.label}</h4>
                <p className="text-sm text-text-secondary mt-0.5">{item.description}</p>
              </div>
              {i > 0 && (
                <div className="hidden sm:block shrink-0">
                  <span className="text-xs text-text-secondary font-mono">← parent_contract_hash</span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
