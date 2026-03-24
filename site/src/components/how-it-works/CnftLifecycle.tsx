'use client';

import { motion, useReducedMotion } from 'framer-motion';

const steps = [
  {
    number: '01',
    title: 'Draft',
    description: 'Agent or principal calls the Ambr API. AI generates dual-format output — human-readable legal text and machine-parsable JSON — linked by SHA-256 hash.',
    detail: 'STATUS: DRAFT',
  },
  {
    number: '02',
    title: 'Handshake',
    description: 'Counterparties review, negotiate visibility preferences, and signal intent — accept, reject, or request changes. All via wallet or agent delegation.',
    detail: 'VISIBILITY: NEGOTIATED',
  },
  {
    number: '03',
    title: 'Activate',
    description: 'Both parties sign with ECDSA wallet signatures. Second signature activates the contract and triggers cNFT minting on Base L2 with the SHA-256 hash stored on-chain.',
    detail: 'SIGNED + MINTED',
  },
];

const stats = [
  { value: '< 400ms', label: 'Average contract generation' },
  { value: 'SHA-256', label: 'Cryptographic binding' },
  { value: 'Base L2', label: 'On-chain verification' },
];

export default function CnftLifecycle() {
  const prefersReduced = useReducedMotion();

  return (
    <div>
      <div className="mb-12">
        <p className="text-micro-dark mb-2">Lifecycle</p>
        <h3 className="text-3xl text-background lg:text-5xl mb-4">
          Contract Lifecycle
        </h3>
        <p className="text-[#333] max-w-xl">
          From creation to activation — every step is cryptographically
          verifiable. Full contract text is private by default.
        </p>
      </div>

      {/* 3 main cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-amber/60 border border-amber/60 mb-8">
        {steps.map((step, i) => (
          <motion.div
            key={step.number}
            initial={prefersReduced ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.1 }}
            className="bg-background p-8 flex flex-col"
          >
            {/* Icon placeholder — geometric SVG */}
            <svg className="w-10 h-10 mb-6" viewBox="0 0 40 40" fill="none" stroke="#c6a87c" strokeWidth="1">
              {i === 0 && (
                <>
                  <rect x="4" y="4" width="32" height="32" />
                  <line x1="4" y1="20" x2="36" y2="20" />
                  <line x1="20" y1="4" x2="20" y2="36" />
                </>
              )}
              {i === 1 && (
                <>
                  <circle cx="20" cy="20" r="16" />
                  <circle cx="20" cy="20" r="6" />
                  <line x1="20" y1="4" x2="20" y2="14" />
                  <line x1="20" y1="26" x2="20" y2="36" />
                </>
              )}
              {i === 2 && (
                <>
                  <polygon points="20,2 38,20 20,38 2,20" />
                  <circle cx="20" cy="20" r="8" />
                </>
              )}
            </svg>

            <h4 className="text-xl text-text-primary mb-3">{step.title}</h4>
            <p className="text-sm text-[#999] leading-relaxed flex-1">{step.description}</p>

            <div className="mt-6 pt-4 border-t border-amber/30">
              <span className="text-micro">{step.detail}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-px bg-amber/60 border border-amber/60">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-background p-6 text-center">
            <p className="text-2xl text-text-primary font-mono mb-1">{stat.value}</p>
            <p className="text-micro !text-[#666]">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
