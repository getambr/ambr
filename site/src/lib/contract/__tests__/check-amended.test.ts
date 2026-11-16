import { describe, expect, it } from 'vitest';
import { runCheck, type CheckContractRow } from '../check-payment';
import { CREATED, goldens, NOW, runGolden, type Golden } from './check-fixtures';

const d1 = goldens()['d1-general-auth'];

describe('the oversight threshold of the contract column', () => {
  it('is judged as an approval threshold even when the agreement text does not state it', () => {
    const r = runGolden(d1, { oversightThresholdUsd: 30, tx: { amount: 40, period_spent: 0 } });
    expect(r.verdict).toBe('needs_approval');
    expect(r.reasons.join(' ')).toContain('oversight threshold');
  });

  it('is read on the period total too, like the threshold in the text', () => {
    expect(runGolden(d1, { oversightThresholdUsd: 230, tx: { amount: 40, period_spent: 200 } }).verdict).toBe('needs_approval');
    expect(runGolden(d1, { oversightThresholdUsd: 250, tx: { amount: 40, period_spent: 200 } }).verdict).toBe('within_limits');
    expect(runGolden(d1, { oversightThresholdUsd: 250, tx: { amount: 40, period_spent: undefined } }).verdict).toBe('incomplete');
  });

  it('counts the lower of the column and the text', () => {
    const lower = runGolden(d1, { oversightThresholdUsd: 30, mr: (m) => { m.oversight_threshold_usd = 5000; }, tx: { amount: 40, period_spent: 0 } });
    expect(lower.verdict).toBe('needs_approval');
    const textLower = runGolden(d1, { oversightThresholdUsd: 5000, mr: (m) => { m.oversight_threshold_usd = 30; }, tx: { amount: 40, period_spent: 0 } });
    expect(textLower.verdict).toBe('needs_approval');
  });

  it('accepts a numeric string from the database and is incomplete for a value it cannot read', () => {
    expect(runGolden(d1, { oversightThresholdUsd: '30', tx: { amount: 40, period_spent: 0 } }).verdict).toBe('needs_approval');
    for (const bad of [-1, 'abc', Number.NaN]) expect(runGolden(d1, { oversightThresholdUsd: bad }).verdict).toBe('incomplete');
    expect(runGolden(d1, { oversightThresholdUsd: null }).verdict).toBe('within_limits');
  });
});

/** A database that answers the two reads an amendment chain makes. */
function fakeDb(child: CheckContractRow) {
  const chain = (result: unknown) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.single = async () => ({ data: result });
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: result });
    return q;
  };
  return { from: (table: string) => (table === 'amendment_proposals' ? chain([{ resulting_contract_id: child.id }]) : chain(child)) } as unknown as Parameters<typeof runCheck>[0];
}

const rowOf = (g: Golden, over: Partial<CheckContractRow>): CheckContractRow => ({
  id: 'row-original',
  contract_id: 'amber-2026-0001',
  status: 'active',
  sha256_hash: 'a'.repeat(64),
  visibility: 'public',
  parameters: structuredClone(g.parameters),
  machine_readable: structuredClone(g.machineReadable),
  templates: { slug: g.slug },
  created_at: CREATED,
  expiry_date: null,
  ...over,
});

describe('an amended agreement', () => {
  const tx = { amount: 40, currency: 'USD', category: 'procurement', action: 'pay_invoice', period_spent: 0 };
  // The amended version's text is regenerated without the threshold; the column still holds it.
  const amendedText = structuredClone(d1.machineReadable);
  delete amendedText.oversight_threshold_usd;

  it('keeps the oversight threshold of the amended version, read from its column', async () => {
    const original = rowOf(d1, { status: 'amended', oversight_threshold_usd: 30, machine_readable: { ...structuredClone(d1.machineReadable), oversight_threshold_usd: 30 } });
    const child = rowOf(d1, { id: 'row-amended', contract_id: 'amber-2026-0002', sha256_hash: 'b'.repeat(64), machine_readable: amendedText, oversight_threshold_usd: 30 });
    const run = await runCheck(fakeDb(child), original, tx, {}, NOW);
    expect(run.forbidden).toBe(false);
    if (run.forbidden) return;
    expect(run.result.effective_contract_id).toBe('amber-2026-0002');
    expect(run.result.verdict).toBe('needs_approval');
    expect(run.result.reasons.join(' ')).toContain('oversight threshold');
  });

  it('is within_limits when no threshold was ever set', async () => {
    const original = rowOf(d1, { status: 'amended' });
    const child = rowOf(d1, { id: 'row-amended', contract_id: 'amber-2026-0002', sha256_hash: 'b'.repeat(64), machine_readable: amendedText, oversight_threshold_usd: null });
    const run = await runCheck(fakeDb(child), original, tx, {}, NOW);
    expect(run.forbidden === false && run.result.verdict).toBe('within_limits');
  });

  it('counts the term from the amended version\'s own creation, as the database fills its expiry', async () => {
    // Twelve months from the first version's creation ended before NOW; the amended version was created later.
    const old = '2025-05-01T00:00:00Z';
    const amendedAt = '2026-05-01T00:00:00Z';
    const original = rowOf(d1, { status: 'amended', created_at: old });
    const child = rowOf(d1, { id: 'row-amended', contract_id: 'amber-2026-0002', sha256_hash: 'b'.repeat(64), created_at: amendedAt });
    const run = await runCheck(fakeDb(child), original, tx, {}, NOW);
    expect(run.forbidden === false && run.result.verdict).toBe('within_limits');
    // The same agreement unamended, created at the earlier time, has expired.
    const unamended = await runCheck(fakeDb(child), rowOf(d1, { created_at: old }), tx, {}, NOW);
    expect(unamended.forbidden === false && unamended.result.verdict).toBe('out_of_scope');
    // The earliest end wins: an expiry on the column that has passed still ends it.
    const expired = rowOf(d1, { id: 'row-amended', contract_id: 'amber-2026-0002', sha256_hash: 'b'.repeat(64), created_at: amendedAt, expiry_date: '2026-06-01T00:00:00Z' });
    const ended = await runCheck(fakeDb(expired), original, tx, {}, NOW);
    expect(ended.forbidden === false && ended.result.verdict).toBe('out_of_scope');
  });
});
