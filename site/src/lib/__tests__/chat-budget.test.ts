import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const gte = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ select: () => ({ gte }) }),
  }),
}));

import { isBudgetExhausted, resetCapWarningForTests } from '../llm/chat-budget';

const ORIGINAL = process.env.AMBR_AGENT_DAILY_USD_CAP;

beforeEach(() => {
  resetCapWarningForTests();
  gte.mockReset();
  gte.mockResolvedValue({ data: [{ cost_usd: 1 }, { cost_usd: 2 }], error: null });
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AMBR_AGENT_DAILY_USD_CAP;
  else process.env.AMBR_AGENT_DAILY_USD_CAP = ORIGINAL;
  vi.restoreAllMocks();
});

describe('chat budget cap', () => {
  it('uses the configured cap', async () => {
    process.env.AMBR_AGENT_DAILY_USD_CAP = '10';
    expect(await isBudgetExhausted()).toEqual({ exhausted: false, configured: true, spent: 3, cap: 10 });
  });

  it('counts as exhausted once spend reaches the cap', async () => {
    process.env.AMBR_AGENT_DAILY_USD_CAP = '3';
    expect((await isBudgetExhausted()).exhausted).toBe(true);
  });

  it('stays off without a cap, skips the spend query and warns once', async () => {
    delete process.env.AMBR_AGENT_DAILY_USD_CAP;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await isBudgetExhausted()).toEqual({ exhausted: true, configured: false, spent: 0, cap: 0 });
    expect((await isBudgetExhausted()).exhausted).toBe(true);
    expect(gte).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('treats an invalid cap as missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const bad of ['abc', '0', '-5']) {
      process.env.AMBR_AGENT_DAILY_USD_CAP = bad;
      expect((await isBudgetExhausted()).configured).toBe(false);
    }
  });
});
