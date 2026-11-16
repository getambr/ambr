import { describe, expect, it } from 'vitest';
import { checkTransaction, termsFromAgreement } from '../check-terms';
import { goldens, NOW, runGolden, type Golden } from './check-fixtures';

// An adversarial pass over the figure rules: money written in the spellings a
// language model or a person may choose, put where an agreement can hold words,
// must never leave the verdict at within_limits.

type Json = Record<string, unknown>;
const all = Object.values(goldens());
const tag = (i: number) => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + (Math.floor(i / 26) % 26));

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPELLINGS = [
  'cap 500 USD',
  'USD500',
  '500EUR',
  '1.000.000 EUR',
  '5 000',
  '250/500 USD',
  '５００ USD',
  '5k',
  'max 30',
  'at most 5k per month',
  '$ 500',
  'EUR 1 000',
  '1,000,000.00',
  'USDC 25',
  '500CHF',
  'CHF500',
  '5ETH',
  '500sats',
  '500dollars',
  '50cents',
  '5bn',
  '5mm',
  '1e3',
  '³⁰ USD',
  'Ⅹ USD per order',
  'thirty dollars',
  'at most thirty dollars per order',
  'twenty euros each',
  'nothing over thirty dollars',
  'purchases above 100 USD',
  'no single payment above 150 USD',
  'thirty dol\u200blars',
  'thi\u00adrty dollars per order',
  'twenty\u2060 euros each',
];

/** Keys whose value may be a figure the shape rules look at, each with a value that carries money. */
const MONEY_UNDER_KEY: [string, unknown][] = [
  ['notice_period', '30 days written notice, or USD 500 to leave early'],
  ['mobile', '+371 20000000, or pay EUR 500'],
  ['breach_penalty', '5% of fees or USD 500'],
  ['sla_credit', 'a credit of 500 USD per breach'],
  ['response_time', 'respond within 4 hours or pay 500 USD'],
  ['uptime_target', '99.9% uptime with a refund of 500 USD'],
  ['support_contact', 'support@example.com, spend up to 500 USD'],
  ['notice_period', '30 days written notice, or 500CHF to leave early'],
  ['sla_credit', '500sats per breach'],
  ['breach_penalty', '5ETH'],
  ['allowance_per_month', 30],
  ['retainer_per_month', { value: 30 }],
  ['stipend_per_week', '30'],
  ['reward_hours', 30],
  ['grace_period_days', 30],
  ['wallet_top_up', 'thirty dollars'],
  ['per_order', { amount: '2000', currency: 'USD' }],
  ['per_invoice', { value: '1999', currency: 'USD' }],
  ['tiers', [{ up_to: '2000', currency: 'USD' }]],
  ['per_order', { amount: 'x2000', currency: 'USD' }],
  ['per_order', { amount: '30 days', currency: 'USD' }],
  // The keys and shapes that are exempt for the generator's own output: each with money in it.
  ['capabilities', { retention: '30 days or USD 500', note: '500 USD' }],
  ['capabilities', ['Level 2 order book', 'up to 500 USD']],
  ['capabilities', ['max 30']],
  ['capabilities', ['500CHF']],
  ['service_list', ['Top 100 symbols', '30 days']],
  ['type', 'hard, 500 USD'],
  ['enforcement', 'hard or 500CHF'],
  ['mode', 'thirty dollars'],
  ['notice_period_hours', '48 USD'],
  ['notice_period_hours', 'USD 48'],
  ['notice_period_hours', '48 hours or 500CHF'],
  ['cooling_off_days', { amount: 5, currency: 'USD' }],
  ['payment_timing', 'Within 30 days of invoice, up to 500 USD'],
  ['payment_timing', 'Within 30 days of invoice or 500CHF'],
  ['payment_timing', 'Within 30 days of invoice, max 500'],
  ['payment_terms', 'Within 5 business days of acceptance plus thirty dollars'],
  ['billing_cycle', 'monthly, 500 USD'],
  ['billing_period', 'monthly or 500CHF'],
  ['protocol', 'x402 USD 500'],
  ['protocol', 'x402 cap 500'],
  ['payment_timing', 'HTTP 402 USD'],
  ['burst_allowance', '100 USD'],
  ['burst_limit', 'USD 100'],
  ['burst', '5k'],
  ['legal_basis', 'Art. 2305 and a cap of 500 USD'],
  ['legal_basis', 'Art. 2305, orders above 2000 need sign-off'],
  ['recipient_wallet', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1999USD'],
  ['spending_limit_note', `fee${'1'.repeat(61)}`],
];

const stringLeaves = (root: unknown): { holder: Json | unknown[]; key: string | number }[] => {
  const out: { holder: Json | unknown[]; key: string | number }[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach((v, i) => (typeof v === 'string' ? out.push({ holder: node, key: i }) : walk(v)));
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) typeof v === 'string' ? out.push({ holder: node as Json, key: k }) : walk(v);
  };
  walk(root);
  return out;
};
const objects = (root: unknown): Json[] => {
  const out: Json[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      out.push(node as Json);
      Object.values(node).forEach(walk);
    }
  };
  walk(root);
  return out;
};

const verdictOf = (g: Golden, parameters: Json, machineReadable: Json) =>
  checkTransaction(termsFromAgreement({ templateSlug: g.slug, parameters, machineReadable, createdAt: g.createdAt }), 'active', g.tx, NOW).verdict;

describe('money in many spellings is never within_limits', () => {
  it('starts from agreements that are within_limits', () => {
    for (const g of all) expect(runGolden(g).verdict, g.slug).toBe('within_limits');
  });

  it('holds when a spelling is appended to a text in the agreement, over 300 seeded insertions', () => {
    const rand = mulberry32(20261115);
    for (let i = 0; i < 300; i++) {
      const g = all[i % all.length];
      const parameters = structuredClone(g.parameters);
      const machineReadable = structuredClone(g.machineReadable);
      const inParameters = rand() < 0.4;
      const spot = (() => {
        const leaves = stringLeaves(inParameters ? parameters : machineReadable);
        return leaves[Math.floor(rand() * leaves.length)];
      })();
      const spelling = SPELLINGS[Math.floor(rand() * SPELLINGS.length)];
      const holder = spot.holder as Record<string | number, string>;
      holder[spot.key] = `${holder[spot.key]} ${spelling}`;
      expect(verdictOf(g, parameters, machineReadable), `${g.slug} ${inParameters ? 'answers' : 'text'} ${String(spot.key)} + ${spelling}`).not.toBe('within_limits');
    }
  });

  it('holds when a spelling is the whole value of a new key anywhere in the text, over 200 seeded insertions', () => {
    const rand = mulberry32(31337);
    for (let i = 0; i < 200; i++) {
      const g = all[i % all.length];
      const machineReadable = structuredClone(g.machineReadable);
      const spots = objects(machineReadable);
      const spot = spots[Math.floor(rand() * spots.length)];
      const spelling = SPELLINGS[Math.floor(rand() * SPELLINGS.length)];
      spot[`extra_${tag(i)}`] = spelling;
      expect(verdictOf(g, g.parameters as Json, machineReadable), `${g.slug} #${i}: ${spelling}`).not.toBe('within_limits');
    }
  });

  it('holds for money written under notice, mobile, breach, sla and response keys, over 200 seeded insertions', () => {
    const rand = mulberry32(424242);
    for (let i = 0; i < 200; i++) {
      const g = all[i % all.length];
      const machineReadable = structuredClone(g.machineReadable);
      const spots = objects(machineReadable);
      const spot = spots[Math.floor(rand() * spots.length)];
      const [key, value] = MONEY_UNDER_KEY[Math.floor(rand() * MONEY_UNDER_KEY.length)];
      spot[key] = value;
      expect(verdictOf(g, g.parameters as Json, machineReadable), `${g.slug} #${i}: ${key}`).not.toBe('within_limits');
    }
  });

  it('holds for money written as a root scalar or a nested value beside a root currency, over every spelling', () => {
    for (const g of all) {
      for (const spelling of SPELLINGS) {
        const scalar = structuredClone(g.machineReadable);
        scalar.currency = 'USD';
        scalar.extra_note = spelling;
        expect(verdictOf(g, g.parameters as Json, scalar), `${g.slug} root scalar: ${spelling}`).not.toBe('within_limits');
        const nested = structuredClone(g.machineReadable);
        nested.currency = 'USD';
        nested.extra_block = { retention: spelling, capabilities: [spelling] };
        expect(verdictOf(g, g.parameters as Json, nested), `${g.slug} nested: ${spelling}`).not.toBe('within_limits');
      }
    }
  });

  it('holds for a digit in an object key', () => {
    for (const g of all) {
      for (const key of ['over_500_usd', '20', 'tier_2', '5k']) {
        const machineReadable = structuredClone(g.machineReadable);
        machineReadable.financial_terms = { ...((machineReadable.financial_terms as Json) ?? {}), [key]: 'applies' };
        expect(verdictOf(g, g.parameters as Json, machineReadable), `${g.slug} ${key}`).not.toBe('within_limits');
      }
    }
  });

  it('holds for a spelling added as an entry of any list answer', () => {
    for (const g of all) {
      for (const key of Object.keys(g.parameters).filter((k) => Array.isArray(g.parameters[k]) && (g.parameters[k] as unknown[]).every((x) => typeof x === 'string'))) {
        for (const spelling of SPELLINGS) {
          const parameters = structuredClone(g.parameters) as Json;
          parameters[key] = [...(parameters[key] as string[]), spelling];
          expect(verdictOf(g, parameters, g.machineReadable as Json), `${g.slug} ${key} + ${spelling}`).not.toBe('within_limits');
        }
      }
    }
  });

  it('holds for a number in the basis or period wording beside any limit of the agreement text', () => {
    for (const g of all) {
      const terms = (g.machineReadable.financial_terms ?? {}) as Json;
      for (const [key, value] of Object.entries(terms)) {
        if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) continue;
        for (const [wording, text] of [['basis', 'per 30 days'], ['period', '12 months'], ['basis', 'per 365 days'], ['period', 'monthly (30 days)'], ['basis', 'per 24 hours']]) {
          const machineReadable = structuredClone(g.machineReadable);
          (machineReadable.financial_terms as Json)[key] = { amount: value, [wording]: text };
          expect(verdictOf(g, g.parameters as Json, machineReadable), `${g.slug} ${key} ${wording}: ${text}`).not.toBe('within_limits');
        }
      }
    }
  });

  it('holds for a duration in months written in the text that is not the answered one', () => {
    for (const g of all) {
      for (const key of ['duration_months', 'term_months']) {
        if (typeof g.parameters[key] !== 'number') continue;
        for (const place of ['duration', 'term', 'validity']) {
          for (const wrong of [1, 7, 24, '1', '7 months', '2 years']) {
            const machineReadable = structuredClone(g.machineReadable);
            machineReadable[place] = { ...((machineReadable[place] as Json) ?? {}), [key]: wrong };
            expect(verdictOf(g, g.parameters as Json, machineReadable), `${g.slug} ${place}.${key} = ${wrong}`).not.toBe('within_limits');
          }
        }
      }
    }
  });

  it('holds for a spelling appended to an enum or identity answer', () => {
    for (const g of all) {
      for (const key of Object.keys(g.parameters).filter((k) => typeof g.parameters[k] === 'string')) {
        const parameters = structuredClone(g.parameters) as Json;
        parameters[key] = `${parameters[key] as string} cap 500 USD`;
        expect(verdictOf(g, parameters, g.machineReadable as Json), `${g.slug} ${key}`).not.toBe('within_limits');
      }
    }
  });
});

describe('each exemption fails for the right reason: its shape passes, the same shape with money does not', () => {
  const d1 = goldens()['d1-general-auth'];
  const WALLET = `0x${'ab12'.repeat(10)}`;
  // key: where the value goes, ok: a value the exemption covers, bad: the same value with money beside it
  const probes: { name: string; key: string; ok: string; bad: string[] }[] = [
    { name: 'a date', key: 'signed_on', ok: '2026-06-01', bad: ['2026-06-01 and USD 500', '2026-06-01, 500 EUR'] },
    { name: 'a year', key: 'year_of_issue', ok: '2026', bad: ['2026 budget 5k', '2026 USD500', '2026 500CHF'] },
    { name: 'a standard', key: 'standard_reference', ok: 'ISO 27001', bad: ['ISO 27001 plus USD 500', 'ISO 27001 cap 500 USD'] },
    { name: 'a wallet', key: 'anchor_reference', ok: WALLET, bad: [`${WALLET} USD 500`, `${WALLET} max 30`] },
    { name: 'a contract id', key: 'related_contract', ok: 'amb-2026-001', bad: ['amb-2026-001 USD 500', 'amb-2026-001 5k'] },
    { name: 'a version under a version key', key: 'schema_version', ok: '2.1', bad: ['2.1 cap USD 500', '2.1 max 30', '2.1 5ETH'] },
    { name: 'a phone number under a phone key', key: 'mobile', ok: '+371 20000000', bad: ['+371 20000000 pay EUR 500', '+371 20000000 max 30'] },
    { name: 'a link', key: 'reference_url', ok: 'https://example.com/a1', bad: ['https://example.com/a1 USD 500', 'https://example.com/a1 pays 5k'] },
    { name: 'an identifier', key: 'agent_class', ok: 'procurement-bot-v2', bad: ['procurement-bot-v2 max 30', 'procurement-bot-v2 USD500', 'procurement-bot-v2 500CHF', 'procurement-bot-v2 5ETH', 'CHF500', 'sats500'] },
    { name: 'a duration', key: 'notice_period', ok: '30 days written notice', bad: ['30 days written notice, penalty USD 500', '30 days notice or 500EUR', '30 days notice or 500CHF', '30 days notice or thirty dollars'] },
    { name: 'an uptime percentage', key: 'uptime_commitment', ok: '99.9% uptime', bad: ['99.9% uptime with a credit of 500 USD', '99.9% uptime, refund 5k'] },
    { name: 'a rate', key: 'rate_limit', ok: '60 requests per minute', bad: ['60 requests per minute, overage USD 500', '60 requests per minute max 30'] },
    { name: 'a citation under a recital key', key: 'recitals', ok: 'Article 5(1) of Regulation (EU) 2024/1689', bad: ['Article 5(1) of Regulation (EU) 2024/1689 and a cap of USD 500', 'Article 5(1) cap 500 USD', 'Article 5(1) and orders above 2000 need sign-off', 'Article 5(1), each order is subject to cap 30', 'Article 5(1), orders above 30/40 need sign-off', 'Article 5(1) and Section 7(500)', 'Article 5(1), orders greater than Act 2000 require two signatures', 'Article 5(1), purchases over No. 30 require the Principal to sign', 'Article 5(1), Act 2000 a month'] },
  ];

  for (const p of probes) {
    it(`${p.name}`, () => {
      const at = (value: string) => runGolden(d1, { mr: (m) => { m[p.key] = value; } });
      expect(at(p.ok).verdict, `the shape alone (${p.ok})`).toBe('within_limits');
      for (const bad of p.bad) {
        const r = at(bad);
        expect(r.verdict, bad).not.toBe('within_limits');
        expect(r.reasons.join(' '), bad).toContain(p.key);
      }
    });
  }
});
