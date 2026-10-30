import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  transactionValueOf,
  applyThresholdToDocument,
  resolveOversight,
} from '@/lib/compliance/oversight-gate';

// One chainable stub standing in for the parent-contract lookup. Mirrors the
// audit.test.ts approach of mocking @/lib/supabase-admin wholesale.
const parentRow: { value: Record<string, unknown> | null } = { value: null };

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => ({ data: parentRow.value }),
          }),
        }),
      }),
    }),
  }),
}));

beforeEach(() => {
  parentRow.value = null;
});

describe('transactionValueOf', () => {
  it('reads the value fields in a fixed order so both callers agree', () => {
    expect(transactionValueOf({ value_usd: 900, amount: 1 })).toBe(900);
    expect(transactionValueOf({ spending_limit_per_tx: 500, amount: 1 })).toBe(500);
    expect(transactionValueOf({ amount: 42 })).toBe(42);
  });

  it('is zero when nothing names a value, so a missing field cannot trip the gate', () => {
    expect(transactionValueOf({})).toBe(0);
    expect(transactionValueOf(null)).toBe(0);
  });
});

describe('applyThresholdToDocument', () => {
  it('writes the threshold into the document that gets hashed', () => {
    const doc: Record<string, unknown> = { a: 1 };
    applyThresholdToDocument(doc, 5000);
    expect(doc.oversight_threshold_usd).toBe(5000);
  });

  it('leaves the document untouched when there is no threshold', () => {
    const doc: Record<string, unknown> = { a: 1 };
    applyThresholdToDocument(doc, null);
    expect('oversight_threshold_usd' in doc).toBe(false);
  });
});

describe('resolveOversight — the gate itself', () => {
  it('escalates when the parent threshold is exceeded', async () => {
    parentRow.value = { oversight_threshold_usd: 5000, machine_readable: {}, status: 'active' };
    const d = await resolveOversight({
      parentContractHash: 'a'.repeat(64),
      parameters: { value_usd: 9000 },
    });
    expect(d.requiresPrincipalApproval).toBe(true);
    expect(d.governingThresholdUsd).toBe(5000);
    expect(d.oversightThresholdUsd).toBe(5000);
  });

  it('does not escalate at or below the threshold', async () => {
    parentRow.value = { oversight_threshold_usd: 5000, machine_readable: {}, status: 'active' };
    const d = await resolveOversight({
      parentContractHash: 'a'.repeat(64),
      parameters: { value_usd: 5000 },
    });
    expect(d.requiresPrincipalApproval).toBe(false);
  });

  it('reads a threshold the parent carries only inside its hashed document', async () => {
    // This is how a parent that declared its threshold at creation stores it.
    parentRow.value = {
      oversight_threshold_usd: null,
      machine_readable: { oversight_threshold_usd: 1000 },
      status: 'active',
    };
    const d = await resolveOversight({
      parentContractHash: 'a'.repeat(64),
      parameters: { value_usd: 2500 },
    });
    expect(d.requiresPrincipalApproval).toBe(true);
    expect(d.governingThresholdUsd).toBe(1000);
  });

  it('keeps a declared threshold rather than overwriting it with the parent one', async () => {
    parentRow.value = { oversight_threshold_usd: 5000, machine_readable: {}, status: 'active' };
    const d = await resolveOversight({
      declaredThresholdUsd: 250,
      parentContractHash: 'a'.repeat(64),
      parameters: { value_usd: 9000 },
    });
    // The parent's 5000 governs the escalation; the contract still passes its own 250 down.
    expect(d.governingThresholdUsd).toBe(5000);
    expect(d.oversightThresholdUsd).toBe(250);
    expect(d.requiresPrincipalApproval).toBe(true);
  });

  it('does not escalate when there is no parent — a root contract gates nothing', async () => {
    const d = await resolveOversight({
      declaredThresholdUsd: 5000,
      parameters: { value_usd: 999999 },
    });
    expect(d.requiresPrincipalApproval).toBe(false);
    expect(d.oversightThresholdUsd).toBe(5000);
  });

  it('does not escalate when the parent carries no threshold', async () => {
    parentRow.value = { oversight_threshold_usd: null, machine_readable: {}, status: 'active' };
    const d = await resolveOversight({
      parentContractHash: 'a'.repeat(64),
      parameters: { value_usd: 999999 },
    });
    expect(d.requiresPrincipalApproval).toBe(false);
  });

  it('does not escalate when the parent is not active — the lookup filters on it', async () => {
    parentRow.value = null; // .eq('status','active') matched nothing
    const d = await resolveOversight({
      parentContractHash: 'a'.repeat(64),
      parameters: { value_usd: 999999 },
    });
    expect(d.requiresPrincipalApproval).toBe(false);
  });
});
