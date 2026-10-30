import { describe, it, expect } from 'vitest';
import { Wallet } from 'ethers';
import {
  WAIVER_PHRASE,
  acceptanceMessageTemplate,
  bindsToTermination,
  effectiveAtFrom,
  entitle,
  noticeAcceptance,
  noticeHoursFrom,
  resolvePartySet,
  terminationGate,
  verifySignedIntent,
  type ContractCategory,
} from '@/lib/termination';

// Real ECDSA throughout, matching approval-auth.test.ts. ethers is a direct
// dependency, so genuine signatures cost nothing and exercise the production path.
const HASH = 'c'.repeat(64);
const OTHER_HASH = 'd'.repeat(64);
const PROPOSAL = '11111111-1111-1111-1111-111111111111';
const OTHER_PROPOSAL = '22222222-2222-2222-2222-222222222222';

type Signer = { address: string; signMessage: (m: string) => Promise<string> };

const alice = Wallet.createRandom();
const bob = Wallet.createRandom();
const stranger = Wallet.createRandom();

const lc = (s: string) => s.toLowerCase();
const holders = [lc(alice.address), lc(bob.address)];

const signedBy = async (w: Signer, message: string) => ({
  walletAddress: w.address,
  signature: await w.signMessage(message),
  message,
});

describe('bindsToTermination', () => {
  const proposeMsg = `I propose to terminate Ambr contract amb-test with hash ${HASH}`;

  it('accepts a proposal message naming this hash and the termination verb', () => {
    expect(bindsToTermination(proposeMsg, HASH)).toBe(true);
  });

  it('refuses a message bound to a different contract', () => {
    expect(bindsToTermination(proposeMsg, OTHER_HASH)).toBe(false);
  });

  it('refuses a message with the hash but no termination verb', () => {
    expect(bindsToTermination(`I approve Ambr contract with hash ${HASH}`, HASH)).toBe(false);
  });

  it('refuses a response that does not name the proposal', () => {
    const msg = `I accept and agree to terminate contract ${HASH}`;
    expect(
      bindsToTermination(msg, HASH, { proposalId: PROPOSAL, decision: 'accept' })
    ).toBe(false);
  });

  it('refuses a response bound to a different proposal on the same contract', () => {
    const msg = `I accept and agree to terminate ${HASH}, proposal ${OTHER_PROPOSAL}`;
    expect(
      bindsToTermination(msg, HASH, { proposalId: PROPOSAL, decision: 'accept' })
    ).toBe(false);
  });

  // The replay this design exists to stop: one verb per decision means a
  // signature the counterparty produced for one outcome cannot be submitted as
  // another. The amendment family has a single verb for a flow with three outcomes.
  it('refuses an ACCEPT message replayed as a DECLINE', () => {
    const acceptMsg = `I accept and agree to terminate ${HASH}, proposal ${PROPOSAL}`;
    expect(bindsToTermination(acceptMsg, HASH, { proposalId: PROPOSAL, decision: 'accept' })).toBe(true);
    expect(bindsToTermination(acceptMsg, HASH, { proposalId: PROPOSAL, decision: 'decline' })).toBe(false);
  });

  it('refuses a DECLINE message replayed as an ACCEPT', () => {
    const declineMsg = `I decline to terminate ${HASH}, proposal ${PROPOSAL}`;
    expect(bindsToTermination(declineMsg, HASH, { proposalId: PROPOSAL, decision: 'decline' })).toBe(true);
    expect(bindsToTermination(declineMsg, HASH, { proposalId: PROPOSAL, decision: 'accept' })).toBe(false);
  });

  it('refuses a WITHDRAW message replayed as an ACCEPT', () => {
    const withdrawMsg = `I withdraw my proposal to terminate ${HASH}, proposal ${PROPOSAL}`;
    expect(bindsToTermination(withdrawMsg, HASH, { proposalId: PROPOSAL, decision: 'withdraw' })).toBe(true);
    expect(bindsToTermination(withdrawMsg, HASH, { proposalId: PROPOSAL, decision: 'accept' })).toBe(false);
  });

  it('refuses empty input rather than throwing', () => {
    expect(bindsToTermination('', HASH)).toBe(false);
    expect(bindsToTermination(proposeMsg, '')).toBe(false);
  });
});

describe('verifySignedIntent', () => {
  it('recovers the signer for a genuine signature', async () => {
    const signed = await signedBy(alice, `terminate ${HASH}`);
    const res = verifySignedIntent(signed);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.recovered).toBe(lc(alice.address));
  });

  it('refuses when the recovered address is not the one claimed', async () => {
    const signed = await signedBy(alice, `terminate ${HASH}`);
    const res = verifySignedIntent({ ...signed, walletAddress: bob.address });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('signature_mismatch');
      expect(res.status).toBe(401);
    }
  });

  it('refuses a malformed signature without throwing', () => {
    const res = verifySignedIntent({
      walletAddress: alice.address,
      signature: '0xdeadbeef',
      message: 'terminate',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_signature');
  });
});

describe('resolvePartySet', () => {
  it('accepts a live on-chain holder set', () => {
    const res = resolvePartySet({ currentHolders: holders, fromChain: true, hasTokenIds: true });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.holders).toHaveLength(2);
  });

  // The outage case. Falling back to `signatures` here would authorize a wallet
  // that has already novated its token away, and refuse the one holding it now.
  it('refuses with a retryable 503 when the chain lookup degraded on a tokenised contract', () => {
    const res = resolvePartySet({ currentHolders: holders, fromChain: false, hasTokenIds: true });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('holder_oracle_unavailable');
      expect(res.status).toBe(503);
    }
  });

  it('allows the signatures fallback for legacy contracts with no tokens', () => {
    const res = resolvePartySet({ currentHolders: holders, fromChain: false, hasTokenIds: false });
    expect(res.ok).toBe(true);
  });

  it('refuses a one-sided contract', () => {
    const res = resolvePartySet({ currentHolders: [lc(alice.address)], fromChain: true, hasTokenIds: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('single_party_contract');
  });

  it('treats a duplicated holder as one party', () => {
    const dup = [lc(alice.address), lc(alice.address)];
    const res = resolvePartySet({ currentHolders: dup, fromChain: true, hasTokenIds: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('single_party_contract');
  });
});

describe('terminationGate', () => {
  it.each(['commerce', 'consumer', null] as ContractCategory[])(
    'admits %s contracts to the bilateral flow',
    (category) => {
      expect(terminationGate({ category, status: 'active' }).ok).toBe(true);
    }
  );

  it('admits a disputed contract', () => {
    expect(terminationGate({ category: 'commerce', status: 'disputed' }).ok).toBe(true);
  });

  it.each(['delegation', 'peer'] as ContractCategory[])(
    'sends %s contracts to the unilateral revoke path',
    (category) => {
      const res = terminationGate({ category, status: 'active' });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe('unilateral_termination_available');
        expect(res.status).toBe(403);
      }
    }
  );

  it.each(['terminated', 'revoked', 'amended', 'expired', 'draft'])(
    'refuses to start from %s',
    (status) => {
      const res = terminationGate({ category: 'commerce', status });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe('invalid_status');
    }
  );
});

describe('entitle', () => {
  const proposer = lc(alice.address);

  it('lets a current holder propose', () => {
    expect(entitle({ decision: 'propose', recovered: proposer, holders }).ok).toBe(true);
  });

  it('refuses a non-party proposer', () => {
    const res = entitle({ decision: 'propose', recovered: lc(stranger.address), holders });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('proposer_not_party');
  });

  it('lets the counterparty accept', () => {
    expect(
      entitle({ decision: 'accept', recovered: lc(bob.address), holders, proposerWallet: proposer }).ok
    ).toBe(true);
  });

  it('refuses the proposer accepting their own proposal', () => {
    const res = entitle({ decision: 'accept', recovered: proposer, holders, proposerWallet: proposer });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('proposer_cannot_respond');
  });

  it('refuses the proposer declining their own proposal', () => {
    const res = entitle({ decision: 'decline', recovered: proposer, holders, proposerWallet: proposer });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('proposer_cannot_respond');
  });

  // The novation pair. These are the tests the three sibling routes cannot have,
  // because they resolve parties inside the route; here holders are an input.
  it('accepts a holder who novated IN after the contract was signed', () => {
    const novated = [lc(alice.address), lc(stranger.address)];
    expect(
      entitle({ decision: 'accept', recovered: lc(stranger.address), holders: novated, proposerWallet: proposer }).ok
    ).toBe(true);
  });

  it('refuses an original signer who has novated OUT', () => {
    const novated = [lc(alice.address), lc(stranger.address)];
    const res = entitle({ decision: 'accept', recovered: lc(bob.address), holders: novated, proposerWallet: proposer });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('not_a_current_party');
  });

  it('lets the proposer withdraw even after novating out', () => {
    const novated = [lc(bob.address), lc(stranger.address)];
    expect(
      entitle({ decision: 'withdraw', recovered: proposer, holders: novated, proposerWallet: proposer }).ok
    ).toBe(true);
  });

  it('refuses a withdraw by anyone other than the proposer', () => {
    const res = entitle({ decision: 'withdraw', recovered: lc(bob.address), holders, proposerWallet: proposer });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('not_the_proposer');
  });
});

describe('noticeHoursFrom', () => {
  it('prefers termination.notice_period_hours over every other source', () => {
    const res = noticeHoursFrom(
      { termination: { notice_period_hours: 12, notice_period_days: 5 }, revocation: { notice_period_hours: 99 } },
      { revocation_notice_hours: 7 }
    );
    expect(res).toEqual({ hours: 12, source: 'machine_readable.termination.notice_period_hours' });
  });

  it('converts termination days to hours', () => {
    const res = noticeHoursFrom({ termination: { notice_period_days: 3 } }, {});
    expect(res).toEqual({ hours: 72, source: 'machine_readable.termination.notice_period_days' });
  });

  it('falls back to the revocation field', () => {
    const res = noticeHoursFrom({ revocation: { notice_period_hours: 48 } }, {});
    expect(res.hours).toBe(48);
    expect(res.source).toBe('machine_readable.revocation.notice_period_hours');
  });

  it('falls back to parameters', () => {
    expect(noticeHoursFrom({}, { revocation_notice_hours: 6 }).hours).toBe(6);
    expect(noticeHoursFrom({}, { termination_notice_days: 2 }).hours).toBe(48);
  });

  it('reports none when nothing states a period', () => {
    expect(noticeHoursFrom({}, {})).toEqual({ hours: 0, source: 'none' });
    expect(noticeHoursFrom(null, undefined)).toEqual({ hours: 0, source: 'none' });
  });

  it.each([-1, 100000, 8761])('records %s as invalid rather than silently none', (v) => {
    const res = noticeHoursFrom({ termination: { notice_period_hours: v } }, {});
    expect(res).toEqual({ hours: 0, source: 'invalid' });
  });

  it('ignores non-numeric values', () => {
    expect(noticeHoursFrom({ termination: { notice_period_hours: '48' } }, {}).source).toBe('none');
  });
});

describe('noticeAcceptance', () => {
  const now = new Date('2026-09-02T12:00:00Z');
  const inWindow = new Date('2026-09-05T12:00:00Z');
  const passed = new Date('2026-09-01T12:00:00Z');
  const waiverMsg = `I accept and agree to terminate ${HASH}. ${WAIVER_PHRASE}.`;
  const plainMsg = `I accept and agree to terminate ${HASH}.`;

  it('allows acceptance once the notice period has run', () => {
    const res = noticeAcceptance({ category: 'commerce', noticeHours: 72, effectiveAt: passed, now, message: plainMsg });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.waived).toBe(false);
  });

  it('allows acceptance when no notice period is stated', () => {
    const res = noticeAcceptance({ category: 'commerce', noticeHours: 0, effectiveAt: inWindow, now, message: plainMsg });
    expect(res.ok).toBe(true);
  });

  it('requires the exact waiver phrase inside the window for commerce', () => {
    const res = noticeAcceptance({ category: 'commerce', noticeHours: 72, effectiveAt: inWindow, now, message: plainMsg });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('notice_waiver_required');
      expect(res.message).toContain(WAIVER_PHRASE);
    }
  });

  it('accepts a commerce waiver that carries the phrase', () => {
    const res = noticeAcceptance({ category: 'commerce', noticeHours: 72, effectiveAt: inWindow, now, message: waiverMsg });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.waived).toBe(true);
  });

  // Consumer contracts have no waiver. A consumer cannot buy their way past the notice
  // period with a signature, because a signature does not make a void term valid.
  it('refuses a consumer acceptance inside the window EVEN WITH the waiver phrase', () => {
    const res = noticeAcceptance({ category: 'consumer', noticeHours: 72, effectiveAt: inWindow, now, message: waiverMsg });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('notice_period_not_waivable');
      expect(res.status).toBe(403);
      expect(res.message).toContain(inWindow.toISOString());
    }
  });

  it('allows a consumer acceptance once the period has actually run', () => {
    const res = noticeAcceptance({ category: 'consumer', noticeHours: 72, effectiveAt: passed, now, message: plainMsg });
    expect(res.ok).toBe(true);
  });
});

describe('acceptanceMessageTemplate', () => {
  const now = new Date('2026-09-02T12:00:00Z');
  const inWindow = new Date('2026-09-05T12:00:00Z');
  const base = {
    contractRef: 'amb-2026-0042',
    contractHash: HASH,
    proposalId: PROPOSAL,
    noticeHours: 72,
    effectiveAt: inWindow,
    now,
  };

  it('includes the waiver clause when commerce needs one', () => {
    const t = acceptanceMessageTemplate({ ...base, category: 'commerce' });
    expect(t).toContain(WAIVER_PHRASE);
    expect(bindsToTermination(t, HASH, { proposalId: PROPOSAL, decision: 'accept' })).toBe(true);
  });

  // The template must never hand a consumer a phrase the route will then refuse.
  it('never offers a consumer the waiver clause', () => {
    const t = acceptanceMessageTemplate({ ...base, category: 'consumer' });
    expect(t).not.toContain(WAIVER_PHRASE);
  });

  it('omits the clause once the period has run', () => {
    const t = acceptanceMessageTemplate({ ...base, category: 'commerce', effectiveAt: new Date('2026-09-01T12:00:00Z') });
    expect(t).not.toContain(WAIVER_PHRASE);
  });

  it('produces a string that satisfies its own binding rule', () => {
    const t = acceptanceMessageTemplate({ ...base, category: 'consumer', noticeHours: 0 });
    expect(bindsToTermination(t, HASH, { proposalId: PROPOSAL, decision: 'accept' })).toBe(true);
  });
});

describe('effectiveAtFrom', () => {
  it('adds the notice period to the creation time', () => {
    const created = new Date('2026-09-02T00:00:00Z');
    expect(effectiveAtFrom(created, 72).toISOString()).toBe('2026-09-05T00:00:00.000Z');
  });

  it('is the creation time when there is no notice period', () => {
    const created = new Date('2026-09-02T00:00:00Z');
    expect(effectiveAtFrom(created, 0).getTime()).toBe(created.getTime());
  });
});
