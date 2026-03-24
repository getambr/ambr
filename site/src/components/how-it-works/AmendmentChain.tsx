'use client';

import { motion, useReducedMotion } from 'framer-motion';

const chainExamples = [
  {
    type: 'ORIGINAL',
    label: 'Master SLA',
    hash: 'a1b2c3...',
    description: 'Original compute service agreement between Deployment Agent and Infrastructure Provider.',
  },
  {
    type: 'AMENDMENT',
    label: 'Rate Increase',
    hash: 'd4e5f6...',
    description: 'Amendment increasing rate limit from 10K to 20K requests/day. References parent hash.',
    hasParent: true,
  },
  {
    type: 'CHILD',
    label: 'Task Sub-Agreement',
    hash: 'g7h8i9...',
    description: 'Per-task sub-agreement spawned from master SLA for a specific GPU compute job.',
    hasParent: true,
  },
  {
    type: 'EXTENSION',
    label: '6-Month Extension',
    hash: 'j0k1l2...',
    description: 'Contract extension linked to the original via parent_contract_hash.',
    hasParent: true,
  },
];

export default function AmendmentChain() {
  const prefersReduced = useReducedMotion();

  return (
    <div>
      <p className="text-micro mb-2">Composability</p>
      <h3 className="text-2xl text-text-primary mb-2 lg:text-4xl">
        Amendment Chains
      </h3>
      <p className="text-[#999] mb-8 max-w-2xl">
        Contracts evolve over time. Amendments reference the
        original via <code className="font-mono text-amber text-sm">parent_contract_hash</code>,
        creating a linked chain with full audit trail.
      </p>

      <div className="space-y-3">
        {chainExamples.map((item, i) => (
          <motion.div
            key={item.hash}
            initial={prefersReduced ? {} : { opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.1 }}
            className="relative border border-amber/60 bg-surface p-6"
          >
            {/* Inner frame */}
            <div className="absolute top-3 left-3 right-3 bottom-3 border border-amber/30 pointer-events-none" />
            {/* Corner dots */}
            <div className="absolute top-3 left-3 w-1.5 h-1.5 bg-amber" />
            <div className="absolute top-3 right-3 w-1.5 h-1.5 bg-amber" />
            <div className="absolute bottom-3 left-3 w-1.5 h-1.5 bg-amber" />
            <div className="absolute bottom-3 right-3 w-1.5 h-1.5 bg-amber" />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-micro">{item.type}</span>
                <code className="font-mono text-xs text-text-secondary">{item.hash}</code>
              </div>
              <div className="flex-1">
                <h4 className="text-sm text-amber">{item.label}</h4>
                <p className="text-sm text-[#999] mt-0.5">{item.description}</p>
              </div>
              {item.hasParent && (
                <div className="hidden sm:block shrink-0">
                  <span className="text-micro !text-text-secondary">&larr; parent_contract_hash</span>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
