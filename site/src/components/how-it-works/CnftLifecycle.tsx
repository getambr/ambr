'use client';

import { motion, useReducedMotion } from 'framer-motion';

const steps = [
  {
    number: '01',
    title: 'Contract Creation',
    description:
      'An agent (or principal) calls Ambr to generate a Ricardian Contract. AI produces dual-format output — human-readable legal text + machine-parsable JSON — linked by SHA-256 hash. Status: draft.',
  },
  {
    number: '02',
    title: 'Review & Share',
    description:
      'Both parties review via the Reader Portal. Contracts are private by default — share with lawyers or counterparties using time-limited secure links. Export as JSON, Markdown, or plain text.',
  },
  {
    number: '03',
    title: 'Handshake',
    description:
      'Counterparties accept, reject, or request changes to the contract. Each party negotiates visibility preferences — private, public, metadata_only, or encrypted. Mutual agreement advances the contract to signing.',
  },
  {
    number: '04',
    title: 'Mutual Signing',
    description:
      'Both parties sign with ECDSA wallet signatures. First signature moves the contract to pending. Second signature activates it. Signatures are cryptographically verified on-chain.',
  },
  {
    number: '05',
    title: 'Verification',
    description:
      'Anyone can verify a contract hash to confirm document integrity — no account needed. Full text remains visible only to authorized parties (contract creators or share token holders).',
  },
];

export default function CnftLifecycle() {
  const prefersReduced = useReducedMotion();

  return (
    <div>
      <p className="text-micro-dark mb-2">Lifecycle</p>
      <h3 className="text-2xl text-background mb-2 lg:text-4xl">
        Contract Lifecycle
      </h3>
      <p className="text-[#333] mb-8 max-w-2xl">
        From creation to activation — every step is cryptographically verifiable,
        and full contract text is <span className="text-amber">private by default</span>.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {steps.map((step, i) => (
          <motion.div
            key={step.number}
            initial={prefersReduced ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.1 }}
            className="relative border border-amber/60 bg-background p-5"
          >
            {/* Inner frame */}
            <div className="absolute top-3 left-3 right-3 bottom-3 border border-amber/30 pointer-events-none" />
            {/* Corner dots */}
            <div className="absolute top-3 left-3 w-1.5 h-1.5 bg-amber" />
            <div className="absolute top-3 right-3 w-1.5 h-1.5 bg-amber" />
            <div className="absolute bottom-3 left-3 w-1.5 h-1.5 bg-amber" />
            <div className="absolute bottom-3 right-3 w-1.5 h-1.5 bg-amber" />

            <div className="relative z-10">
              <span className="text-3xl brass-gradient-text font-mono">
                {step.number}
              </span>
              <h4 className="mt-2 text-base text-text-primary">
                {step.title}
              </h4>
              <p className="mt-2 text-sm text-[#999] leading-relaxed">
                {step.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
