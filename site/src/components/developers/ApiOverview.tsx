import ScrollReveal from '@/components/ui/ScrollReveal';
import CodeSnippet from './CodeSnippet';

const endpoints = [
  {
    method: 'POST',
    path: '/v1/contracts',
    description: 'Create a new Ricardian Contract from a template. Returns a draft that both parties must sign.',
    code: `const response = await fetch('https://getamber.dev/api/v1/contracts', {
  method: 'POST',
  headers: {
    'X-API-Key': '<API_KEY>',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    template: 'c1-api-access',
    parameters: {
      buyer_name: 'Acme Analytics Ltd.',
      buyer_agent_id: '0x7a3b...9f2e',
      seller_name: 'DataCo Inc.',
      api_endpoint: 'https://api.dataco.io/v1',
      pricing_model: 'per-call',
      price_per_call: 0.002,
      currency: 'USDC',
      sla_uptime_percent: 99.9,
      governing_law: 'Singapore',
    },
    principal_declaration: {
      agent_id: '0x7a3b...9f2e',
      principal_name: 'Acme Analytics Ltd.',
      principal_type: 'company',
    },
  }),
});
// response.status → 'draft'
// response.sign_url → '/api/v1/contracts/amb-2026-0001/sign'`,
  },
  {
    method: 'POST',
    path: '/v1/contracts/:id/sign',
    description: 'Sign a contract with an ECDSA wallet signature. Both parties must sign to activate.',
    code: `const response = await fetch(
  'https://getamber.dev/api/v1/contracts/amb-2026-0001/sign',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_address: '0x7a3b...9f2e',
      signature: '0x1234...abcd',
      message: 'I agree to the terms of contract with hash: <sha256_hash>',
    }),
  }
);
// First sig:  draft → pending_signature
// Second sig: pending_signature → active`,
  },
  {
    method: 'GET',
    path: '/v1/contracts/:id',
    description: 'Query contract status, metadata, and amendment chain. Full text requires API key or share token.',
    code: `const contract = await fetch(
  'https://getamber.dev/api/v1/contracts/amb-2026-0001',
  { headers: { 'X-API-Key': '<API_KEY>' } }
).then(r => r.json());

// contract.status → 'draft' | 'pending_signature' | 'active' | 'amended'
// contract.sha256_hash → 'a1b2c3...'
// contract.amendment_chain → [{ hash, parent_hash, type }]`,
  },
];

const methodColors: Record<string, string> = {
  GET: 'text-emerald-400 bg-emerald-500/10',
  POST: 'text-amber bg-amber-glow',
};

export default function ApiOverview() {
  return (
    <div className="space-y-8">
      {endpoints.map((ep, i) => (
        <ScrollReveal key={ep.path} delay={i * 0.08}>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={`rounded-md px-2 py-0.5 text-xs font-mono font-bold ${methodColors[ep.method] || 'text-text-secondary'}`}>
                {ep.method}
              </span>
              <code className="font-mono text-sm text-text-primary">{ep.path}</code>
            </div>
            <p className="text-sm text-text-secondary mb-3">{ep.description}</p>
            <CodeSnippet code={ep.code} title={`${ep.method} ${ep.path}`} />
          </div>
        </ScrollReveal>
      ))}

      <ScrollReveal delay={0.3}>
        <div className="rounded-xl border border-amber/20 bg-amber-glow p-5">
          <h3 className="text-base font-semibold text-amber mb-2">Contract Lifecycle</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            Contracts are created as <strong className="text-text-primary">drafts</strong>. The first
            ECDSA wallet signature moves the contract to <strong className="text-text-primary">pending_signature</strong>.
            When the second party signs, the contract becomes <strong className="text-text-primary">active</strong>.
            Both signatures are cryptographically verified — no API key needed to sign, just a valid wallet.
          </p>
        </div>
      </ScrollReveal>
    </div>
  );
}
