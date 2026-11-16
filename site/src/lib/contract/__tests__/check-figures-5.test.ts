import { describe, expect, it } from 'vitest';
import { goldens, runGolden } from './check-fixtures';

// Payment check, usefulness round: what a generator following llm/prompts.ts writes must reach
// within_limits, and every shape that is exempt for that reason stays not within_limits the moment
// money (a currency code or symbol, a money word, or a digit amount beside a limit word) is in it.

type Json = Record<string, unknown>;
type Outcome = ReturnType<typeof runGolden>;
const g = goldens();
const all = Object.values(g);
const d1 = g['d1-general-auth'];
const c1 = g['c1-api-access'];
const c3 = g['c3-task-execution'];
const ft = (m: Json) => m.financial_terms as Json;
const obj = (m: Json, k: string) => m[k] as Json;

const ok = (r: Outcome) => {
  expect(r.reasons).toEqual([]);
  expect(r.verdict).toBe('within_limits');
};
const notOk = (r: Outcome, label?: string) => expect(r.verdict, label).not.toBe('within_limits');

const WALLET = `0x${'ab12'.repeat(10)}`;
const SOL = 'So11111111111111111111111111111111111111112';

describe('a limit hidden in a token that looks like an identifier is not within_limits', () => {
  const cases: [string, string][] = [
    ['spending_limit_monthly', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1999USD'],
    ['monthly_cap', 'Max5999USDpermonthzzzzzzzzzzzzzzzzz'],
    ['per_tx_cap', `fee${'1'.repeat(61)}`],
  ];
  for (const [key, value] of cases) {
    it(`${key} = ${value}`, () => {
      notOk(runGolden(d1, { mr: (m) => { ft(m)[key] = value; } }));
    });
  }

  it('a wallet, an address and a UUID under their own keys stay exempt inside a money section', () => {
    ok(runGolden(d1, { mr: (m) => { ft(m).recipient_wallet = WALLET; } }));
    ok(runGolden(d1, { mr: (m) => { ft(m).settlement_address = SOL; } }));
    ok(runGolden(d1, { mr: (m) => { ft(m).mandate_id = '123e4567-e89b-42d3-a456-426614174000'; } }));
  });

  it('the same keys do not exempt a value that carries a currency or a money word', () => {
    for (const bad of [`${WALLET} USD 500`, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1999USD', `${SOL} thirty dollars`]) {
      notOk(runGolden(d1, { mr: (m) => { ft(m).recipient_wallet = bad; } }), bad);
    }
  });
});

describe('a name that only contains a money word is not money', () => {
  it('capabilities, escape and the like do not taint what sits below them', () => {
    ok(runGolden(d1, { mr: (m) => { m.capabilities = { retention: '30 days' }; } }));
    ok(runGolden(d1, { mr: (m) => { obj(m, 'agent_identification').capabilities = { agent_class: 'v2' }; } }));
    ok(runGolden(d1, { mr: (m) => { m.escape_clause = { notice: '30 days written notice' }; } }));
  });

  it('a whole-word money key still taints everything below it', () => {
    notOk(runGolden(d1, { mr: (m) => { m.capabilities = { fee: '30 days' }; } }));
    notOk(runGolden(d1, { mr: (m) => { m.capabilities = { retention: '30 days', note: '500 USD' }; } }));
    notOk(runGolden(d1, { mr: (m) => { m.capabilities = { limit: '30 days' }; } }));
    notOk(runGolden(d1, { mr: (m) => { m.capabilities = { max_calls: 30 }; } }));
    notOk(runGolden(d1, { mr: (m) => { m.fee_capabilities = { retention: '30 days' }; } }));
    notOk(runGolden(d1, { mr: (m) => { m.cap_escape = { notice: '30 days written notice' }; } }));
  });
});

describe('a currency at the root marks only the scalars beside it', () => {
  it('d1 with its currency moved to the root is within_limits', () => {
    ok(runGolden(d1, { mr: (m) => { delete ft(m).currency; m.currency = 'USD'; } }));
  });

  it('c1 with a root currency is within_limits', () => {
    ok(runGolden(c1, { mr: (m) => { m.currency = 'USDC'; } }));
  });

  it('a flat root limit value nothing explains is still not within_limits', () => {
    notOk(runGolden(d1, { mr: (m) => { m.currency = 'USD'; m.spending_limit_weekly = '500.00'; } }));
    notOk(runGolden(d1, { mr: (m) => { m.currency = 'USD'; m.max_budget = 5000; } }));
    notOk(runGolden(d1, { mr: (m) => { m.currency = 'USD'; m.spending_limit_per_tx = '999.00'; } }));
  });

  it('money beside a root currency is still caught, in a scalar or in a nested section', () => {
    for (const bad of ['30 days written notice or 500EUR', 'cap 500 USD', '5k']) {
      notOk(runGolden(d1, { mr: (m) => { m.currency = 'USD'; m.notice = bad; } }), `root ${bad}`);
      notOk(runGolden(d1, { mr: (m) => { m.currency = 'USD'; m.misc = { retention: bad }; } }), `nested ${bad}`);
    }
    notOk(runGolden(d1, { mr: (m) => { m.currency = 'USD'; m.tiers = [{ up_to: '2000' }]; } }));
  });

  it('a root scalar beside a currency keeps no metric exemption', () => {
    notOk(runGolden(d1, { mr: (m) => { m.currency = 'USD'; m.notice_period = '30 days written notice'; } }));
  });

  it('the root recital, dates, version and identifiers keep their shape rules, which refuse any money', () => {
    const bad: [string, string][] = [
      ['electronic_formation_recital', 'Article 5(1) cap 500 USD'],
      ['electronic_formation_recital', 'Article 5(1), orders above 2000 need sign-off'],
      ['electronic_formation_recital', 'Article 5(1) and a cap of 500CHF'],
      ['created_at', '2026-06-01 USD 500'],
      ['deadline', '2026-09-01, 500 EUR'],
      ['version', '1.0 cap USD 500'],
      ['schema_version', '1.0.0 max 30'],
      ['contract_id', 'amber-2026-0001 USD 500'],
      ['template', 'd1-general-auth 500CHF'],
    ];
    for (const [key, value] of bad) {
      notOk(runGolden(d1, { mr: (m) => { m.currency = 'USD'; m[key] = value; } }), `${key} ${value}`);
    }
  });
});

describe('an enforcement word under a limit object is not wording', () => {
  const limit = (extra: Json) => ({ amount: '100.00', currency: 'USD', ...extra });
  for (const [k, v] of [['type', 'hard'], ['kind', 'soft'], ['enforcement', 'strict'], ['mode', 'block'], ['type', 'require_approval'], ['enforcement', 'Reject']]) {
    it(`${k}: ${v}`, () => {
      ok(runGolden(d1, { mr: (m) => { ft(m).spending_limit_per_tx = limit({ [k]: v }); } }));
    });
  }

  for (const [k, v] of [['type', 'hard 500 USD'], ['type', '500'], ['type', 'monthly'], ['enforcement', 'per month'], ['mode', 'hard, up to 30 more'], ['type', 'thirty dollars'], ['kind', 'weekly'], ['type', 'hard or 500CHF']]) {
    it(`${k}: ${v} is not within_limits`, () => {
      notOk(runGolden(d1, { mr: (m) => { ft(m).spending_limit_per_tx = limit({ [k]: v }); } }));
    });
  }
});

describe('a notice or a payment timing inside the financial terms', () => {
  it('an exact metric key keeps its exemption inside a money section', () => {
    ok(runGolden(d1, { mr: (m) => { ft(m).notice_period_hours = 24; } }));
    ok(runGolden(d1, { mr: (m) => { ft(m).cooling_off_days = 14; } }));
    ok(runGolden(d1, { mr: (m) => { ft(m).cooling_off_days = '14'; } }));
    ok(runGolden(d1, { mr: (m) => { ft(m).notice_period_hours = '24 hours'; } }));
  });

  it('the same keys with money, or inside a limit, are not within_limits', () => {
    for (const bad of ['48 USD', 'USD 48', '48 hours or 500CHF', '5k', 'cap 48', 'thirty dollars']) {
      notOk(runGolden(d1, { mr: (m) => { ft(m).notice_period_hours = bad; } }), bad);
      notOk(runGolden(d1, { mr: (m) => { ft(m).cooling_off_days = bad; } }), bad);
    }
    notOk(runGolden(d1, { mr: (m) => { ft(m).spending_limit_per_tx = { amount: '100.00', currency: 'USD', notice_period_hours: 500 }; } }));
  });

  it('a due date after an event is not a figure under a payment-term key', () => {
    ok(runGolden(d1, { mr: (m) => { ft(m).payment_timing = 'Within 30 days of invoice'; } }));
    ok(runGolden(c1, { mr: (m) => { ft(m).payment_timing = 'Within 30 days of receipt'; } }));
    ok(runGolden(c3, { mr: (m) => { ft(m).payment_timing = 'Within 5 business days of acceptance'; } }));
    ok(runGolden(c3, { mr: (m) => { m.payment_terms = '10 calendar days after delivery'; } }));
  });

  it('a due date with money or a limit beside it is not within_limits', () => {
    for (const bad of [
      'Within 30 days of invoice, up to 500 USD',
      'Within 30 days of invoice or 500CHF',
      'Within 30 days of invoice, max 500',
      'Within 30 days of invoice plus thirty dollars',
      'Within 30 days of invoice, cap 500',
      'Within 30 days of invoice 5k',
    ]) {
      notOk(runGolden(d1, { mr: (m) => { ft(m).payment_timing = bad; } }), bad);
      notOk(runGolden(c3, { mr: (m) => { m.payment_terms = bad; } }), bad);
    }
    // The same words under another key keep no exemption.
    notOk(runGolden(d1, { mr: (m) => { ft(m).settlement_window = 'Within 30 days of invoice'; } }));
  });
});

describe('a billing cadence beside a price per call', () => {
  const pricing = (extra: Json) => ({ pricing_model: 'per-call', price_per_call: '0.01', currency: 'USDC', monthly_cap_usd: '500.00', ...extra });
  it('c1 with a monthly billing cycle is within_limits', () => {
    ok(runGolden(c1, { mr: (m) => { m.pricing = pricing({ billing_cycle: 'monthly' }); } }));
    ok(runGolden(c1, { mr: (m) => { m.pricing = pricing({ billing_period: 'Monthly', invoicing_frequency: 'monthly' }); } }));
  });

  it('a price per call alone with a cadence has nothing left to read', () => {
    ok(runGolden(c1, { mr: (m) => { m.pricing = { pricing_model: 'per-call', price_per_call: '0.01', currency: 'USDC', billing_cycle: 'monthly' }; } }));
  });

  it('a cadence that is not the monthly cap period is not within_limits', () => {
    for (const bad of ['weekly', 'annual', 'per quarter', 'monthly, 500 USD', 'monthly or 500CHF', '30 days']) {
      notOk(runGolden(c1, { mr: (m) => { m.pricing = pricing({ billing_cycle: bad }); } }), bad);
    }
  });
});

describe('protocol names, burst allowance and legal citations that the prompts ask for', () => {
  it('x402 and HTTP 402 are names, inside a money section too', () => {
    ok(runGolden(c1, { mr: (m) => { m.payment_terms = { x402_enabled: true, settlement_currency: 'USDC', protocol: 'x402' }; } }));
    ok(runGolden(c1, { mr: (m) => { ft(m).payment_timing = 'Per call via HTTP 402'; } }));
    ok(runGolden(c1, { mr: (m) => { m.payment_terms = { settlement_currency: 'USDC', payment_timing: 'Per call via HTTP 402' }; } }));
  });

  it('the protocol name with money or a limit beside it is not within_limits', () => {
    for (const bad of ['x402 USD 500', 'x402 cap 500', 'HTTP 402 USD', 'x402 or 500CHF', 'x402 5ETH', 'HTTP 402, thirty dollars', 'x402 max 30', 'x402, up to two thousand a month']) {
      notOk(runGolden(c1, { mr: (m) => { m.payment_terms = { settlement_currency: 'USDC', protocol: bad }; } }), `protocol ${bad}`);
      notOk(runGolden(c1, { mr: (m) => { ft(m).payment_timing = bad; } }), `timing ${bad}`);
    }
  });

  it('the protocol name with a number word or a limit word beside it is not within_limits', () => {
    for (const k of ['spending_limit_weekly']) {
      for (const bad of ['x402 two thousand', 'HTTP 402, two thousand per week', 'x402']) {
        notOk(runGolden(d1, { mr: (m) => { ft(m)[k] = bad; } }), `${k} ${bad}`);
      }
    }
    for (const bad of ['x402, two thousand', 'x402']) {
      notOk(runGolden(c1, { mr: (m) => { ft(m).weekly_cap = bad; } }), `weekly_cap ${bad}`);
    }
    for (const bad of ['x402, up to two thousand per month', 'x402, weekly ceiling of a thousand']) {
      notOk(runGolden(c1, { mr: (m) => { ft(m).protocol = bad; } }), `protocol ${bad}`);
    }
    notOk(runGolden(c1, { mr: (m) => { ft(m).payment_protocol = 'HTTP 402 capped at one thousand'; } }));
    notOk(runGolden(c1, { mr: (m) => { ft(m).x402_enabled = 'x402, max two thousand weekly'; } }));
    notOk(runGolden(d1, { mr: (m) => { m.payment_protocol = 'x402, up to a thousand a week'; } }));
  });

  it('the protocol name with only connective words stays within_limits', () => {
    ok(runGolden(c1, { mr: (m) => { ft(m).payment_timing = 'Per request via HTTP 402'; } }));
    ok(runGolden(c1, { mr: (m) => { ft(m).payment_timing = 'Settled on receipt over x402'; } }));
  });

  it('burst keys are rates', () => {
    ok(runGolden(c1, { mr: (m) => { m.rate_limits = { requests_per_minute: 60, burst_allowance: 100 }; } }));
    ok(runGolden(c1, { mr: (m) => { m.rate_limits = { requests_per_minute: 60, burst: 100, burst_limit: 200 }; } }));
  });

  it('burst with money, or inside a money section, is not within_limits', () => {
    for (const bad of ['100 USD', 'USD 100', '5k', '100 requests or 500CHF']) {
      notOk(runGolden(c1, { mr: (m) => { m.rate_limits = { requests_per_minute: 60, burst_allowance: bad }; } }), bad);
    }
    notOk(runGolden(c1, { mr: (m) => { ft(m).burst_limit = 100; } }));
    notOk(runGolden(c1, { mr: (m) => { ft(m).burst_allowance = 100; } }));
    notOk(runGolden(c1, { mr: (m) => { m.rate_limits = { requests_per_minute: 60, burst_limit: { amount: 100, currency: 'USDC' } }; } }));
  });

  it('a legal basis is a citation', () => {
    ok(runGolden(d1, { mr: (m) => { m.sub_delegation = { allowed: false, legal_basis: 'Art. 2305' }; } }));
    ok(runGolden(d1, { mr: (m) => { m.sub_delegation = { allowed: false, legal_reference: 'Article 5(1) of Regulation (EU) 2024/1689' }; } }));
  });

  it('a legal basis that holds money or a limit, or sits in a money section, is not within_limits', () => {
    for (const bad of ['Art. 2305 and a cap of 500 USD', 'Art. 2305, orders above 2000 need sign-off', 'Art. 2305 plus 500CHF', 'Art. 2305, each order is subject to cap 30', 'Art. 2305, up to two thousand a month']) {
      notOk(runGolden(d1, { mr: (m) => { m.sub_delegation = { allowed: false, legal_basis: bad }; } }), bad);
    }
    notOk(runGolden(d1, { mr: (m) => { ft(m).legal_basis = 'Art. 2305'; } }));
  });
});

describe('a list of names in the agreement text', () => {
  it('entries that are names with digits are not figures outside money', () => {
    ok(runGolden(c1, { mr: (m) => { m.service = { capabilities: ['Level 2 order book', 'Top 100 symbols'] }; } }));
  });

  it('names without a number word stay names, "one" included', () => {
    ok(runGolden(c1, { mr: (m) => { m.service = { capabilities: ['One-stop shop', 'Microsoft 365', 'AWS EC2', 'One-time setup'] }; } }));
  });

  it('entries that carry money, a limit, a duration or only a number are not within_limits', () => {
    for (const bad of ['up to 500 USD', 'max 30', '500CHF', '30 days', '50', 'orders over 100', '5k', '1e3', 'thirty dollars', 'Five hundred per order']) {
      notOk(runGolden(c1, { mr: (m) => { m.service = { capabilities: ['Level 2 order book', bad] }; } }), bad);
    }
  });

  it('a list inside a money section keeps its digits as figures', () => {
    notOk(runGolden(c1, { mr: (m) => { ft(m).tiers = ['Level 2 order book']; } }));
    notOk(runGolden(c1, { mr: (m) => { m.service = { fee: { currency: 'USDC', capabilities: ['Top 100 symbols'] } }; } }));
  });
});

describe('a metric number that differs from the same metric in the answers', () => {
  it('is a conflict', () => {
    notOk(runGolden(c1, { mr: (m) => { obj(m, 'api').rate_limit_rpm = 6000; } }));
    notOk(runGolden(c1, { mr: (m) => { obj(m, 'sla').sla_response_ms = 99999; } }));
    notOk(runGolden(d1, { mr: (m) => { obj(m, 'revocation').notice_period_hours = 1; } }));
  });

  it('written as text it is compared with the answer too', () => {
    notOk(runGolden(d1, { mr: (m) => { ft(m).revocation_notice_hours = '5000'; } }));
    notOk(runGolden(d1, { mr: (m) => { ft(m).notice_period_hours = '5000'; } }));
    ok(runGolden(d1, { mr: (m) => { ft(m).revocation_notice_hours = '24'; } }));
    ok(runGolden(d1, { mr: (m) => { ft(m).notice_period_hours = '24 hours'; } }));
  });

  it('the same number, or a metric the answers do not state, is not', () => {
    ok(runGolden(c1, { mr: (m) => { obj(m, 'api').rate_limit_rpm = 60; obj(m, 'sla').sla_response_ms = 800; } }));
    ok(runGolden(c1, { mr: (m) => { m.cooling_off_days = 14; } }));
  });
});

describe('generator output that follows the prompts reaches within_limits', () => {
  it('d1 with a root currency, a typed hard limit, a cadence, a notice and a payment timing', () => {
    ok(
      runGolden(d1, {
        mr: (m) => {
          m.currency = 'USD';
          m.billing_cycle = 'monthly';
          m.capabilities = { retention: '30 days', protocol: 'x402' };
          m.escape_clause = { notice: '30 days written notice' };
          obj(m, 'agent_identification').capabilities = { agent_class: 'v2', supported: ['Level 2 order book', 'Top 100 symbols'] };
          m.sub_delegation = { allowed: false, legal_basis: 'Art. 2305' };
          ft(m).spending_limit_per_tx = { amount: '100.00', currency: 'USD', type: 'hard' };
          ft(m).payment_timing = 'Within 30 days of invoice';
          ft(m).notice_period_hours = 24;
          ft(m).recipient_wallet = WALLET;
        },
      }),
    );
  });

  it('c1 with a root currency, a cadence, x402, a burst allowance and a legal basis', () => {
    ok(
      runGolden(c1, {
        mr: (m) => {
          m.currency = 'USDC';
          m.pricing = { pricing_model: 'per-call', price_per_call: '0.01', currency: 'USDC', billing_cycle: 'monthly', monthly_cap_usd: '500.00' };
          m.rate_limits = { requests_per_minute: 60, burst_allowance: 100 };
          m.payment_terms = { x402_enabled: true, settlement_currency: 'USDC', protocol: 'x402', payment_timing: 'Per call via HTTP 402' };
          m.service = { capabilities: ['Level 2 order book', 'Top 100 symbols'] };
          m.sub_delegation = { allowed: false, legal_basis: 'Art. 2305' };
          m.termination = { notice_period_hours: 24 };
          ft(m).payment_timing = 'Within 30 days of invoice';
        },
      }),
    );
  });

  it('every golden with a root currency added still reaches within_limits', () => {
    for (const golden of all) {
      const r = runGolden(golden, { mr: (m) => { m.currency = 'USD'; } });
      // A golden whose own currency is another code reports that as a conflict; the rest must be clean.
      if (golden.parameters.currency === undefined || golden.parameters.currency === 'USD') expect(r.verdict, golden.slug).toBe('within_limits');
    }
  });
});

describe('a company name with a number word stays a name, a spelled-out limit stays a figure', () => {
  const names = ['Three Rivers Ltd', 'One-stop shop'];
  for (const name of names) {
    it(`${name} passes as a category answer on d1`, () => {
      ok(
        runGolden(d1, {
          parameters: (p) => { p.categories = ['procurement', name]; },
          mr: (m) => { obj(m, 'scope_of_delegation').approved_categories = ['procurement', name]; },
        }),
      );
    });
    for (const [label, golden] of [['d1', d1], ['c1', c1]] as const) {
      it(`${name} passes in service.capabilities on ${label}`, () => {
        ok(runGolden(golden, { mr: (m) => { m.service = { capabilities: ['Level 2 order book', name] }; } }));
      });
    }
  }

  // Without a company word at the end (or a party name to repeat) a strong number word is a figure, a name or not.
  const limits = ['Five hundred per order', 'a thousand per order', 'one hundred per order', 'hundred-dollar items only', 'Seven Eleven supplies'];
  for (const entry of limits) {
    it(`${entry} is not within_limits as a category answer or a capability`, () => {
      notOk(
        runGolden(d1, {
          parameters: (p) => { p.categories = ['procurement', entry]; },
          mr: (m) => { obj(m, 'scope_of_delegation').approved_categories = ['procurement', entry]; },
        }),
      );
      notOk(runGolden(c1, { mr: (m) => { m.service = { capabilities: [entry] }; } }));
    });
  }
});

describe('a notice under a metric key is compared in hours and is never money', () => {
  const metricKeys: [string, (m: Json, v: string) => void][] = [
    ['financial_terms.revocation_notice_hours', (m, v) => { ft(m).revocation_notice_hours = v; }],
    ['revocation.notice_period_hours', (m, v) => { obj(m, 'revocation').notice_period_hours = v; }],
  ];
  for (const [label, set] of metricKeys) {
    for (const v of ['24 USD', '$24']) {
      it(`${label} = ${v} is not within_limits`, () => {
        notOk(runGolden(d1, { mr: (m) => set(m, v) }));
      });
    }
  }

  const set = (v: string) => (m: Json) => { obj(m, 'revocation').notice_period = v; };
  for (const v of ['24 hours', '24h', '1 day']) {
    it(`revocation.notice_period = ${v} equals the answer of 24 hours`, () => {
      ok(runGolden(d1, { mr: set(v) }));
    });
  }
  for (const v of ['5000 hours', '24 days', 'five thousand hours', '1 month']) {
    it(`revocation.notice_period = ${v} is not within_limits`, () => {
      notOk(runGolden(d1, { mr: set(v) }));
    });
  }
  it('revocation.revocation_notice = 5000 hours is not within_limits', () => {
    notOk(runGolden(d1, { mr: (m) => { obj(m, 'revocation').revocation_notice = '5000 hours'; } }));
  });
});

describe('a protocol name is exempt only under a protocol or payment timing key', () => {
  it('x402 under a limit key inside a limits object is not within_limits', () => {
    notOk(runGolden(d1, { mr: (m) => { ft(m).limits = { per_order: 'x402' }; } }));
  });
  it('x402 under a mapped role key is not within_limits', () => {
    notOk(runGolden(d1, { mr: (m) => { ft(m).per_order = 'x402'; } }));
  });
  it('payment_timing and protocol keep their protocol wording', () => {
    ok(runGolden(c1, { mr: (m) => { m.payment_terms = { protocol: 'x402', payment_timing: 'Per call via HTTP 402' }; } }));
  });
});
