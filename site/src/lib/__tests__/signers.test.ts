import { describe, it, expect } from 'vitest';
import {
  canSignAs,
  missingSlots,
  openSlots,
  principalWalletFromKey,
  resolveSignerParties,
  sharedWalletBothSides,
  type SignerParties,
  UNGATED,
} from '@/lib/contract/signers';

const A = '0x' + 'a'.repeat(40);
const B = '0x' + 'b'.repeat(40);
const C = '0x' + 'c'.repeat(40);
const ZERO = '0x' + '0'.repeat(40);

describe('resolveSignerParties', () => {
  it('reads every template party field, lowercased, on the right side', () => {
    const upper = (w: string) => '0x' + w.slice(2).toUpperCase();
    const p = resolveSignerParties({
      principal_wallet: upper(A),
      parameters: { requester_agent_id: upper(A), executor_agent_id: B, bogus_agent_id: C },
    });
    expect(p.principal).toEqual([A]);
    expect(p.counterparty).toEqual([B]);
  });

  it('ignores values that are not wallets', () => {
    const p = resolveSignerParties({ principal_wallet: 'unknown', parameters: { provider_agent_id: 'bob' } });
    expect(p.principal).toEqual([]);
    expect(p.counterparty).toEqual([]);
  });

  it('one-sided: principal_wallet only, delegatee wallet is not a signer', () => {
    const p = resolveSignerParties({ is_one_sided: true, principal_wallet: A, parameters: { agent_id: B, principal_agent_id: C } });
    expect(p).toEqual({ oneSided: true, principal: [A], counterparty: [] });
  });
});

describe('canSignAs / missingSlots', () => {
  const c3 = resolveSignerParties({
    principal_wallet: A,
    parameters: { requester_agent_id: A, executor_agent_id: B },
  });

  it('refuses a wallet that is neither party', () => {
    expect(canSignAs(c3, [], C, UNGATED).ok).toBe(false);
    expect(canSignAs(c3, [A], C, UNGATED)).toEqual({ ok: false, open: ['counterparty'] });
  });

  it('accepts each declared party once', () => {
    expect(canSignAs(c3, [], A, UNGATED)).toEqual({ ok: true, slot: 'principal' });
    expect(canSignAs(c3, [A], B, UNGATED)).toEqual({ ok: true, slot: 'counterparty' });
    expect(canSignAs(c3, [A, B], A, UNGATED).ok).toBe(false);
  });

  it('a counterparty-first signature leaves the principal slot open', () => {
    expect(missingSlots(c3, [B])).toEqual(['principal']);
    expect(canSignAs(c3, [B], A, UNGATED).ok).toBe(true);
  });

  it('a rogue earlier signature does not fill a slot', () => {
    expect(missingSlots(c3, [A, C])).toEqual(['counterparty']);
  });

  it('an undeclared counterparty is open to any wallet the principal side has not claimed', () => {
    const c1 = resolveSignerParties({ principal_wallet: A, parameters: { buyer_agent_id: A } });
    expect(canSignAs(c1, [A], C, UNGATED).ok).toBe(true);
    expect(canSignAs(c1, [], C, UNGATED)).toEqual({ ok: true, slot: 'counterparty' });
  });

  it('one-sided needs the principal and nobody else', () => {
    const p2 = resolveSignerParties({ is_one_sided: true, principal_wallet: A });
    expect(canSignAs(p2, [], B, UNGATED).ok).toBe(false);
    expect(canSignAs(p2, [], A, UNGATED).ok).toBe(true);
    expect(missingSlots(p2, [A])).toEqual([]);
    expect(missingSlots(p2, [B])).toEqual(['principal']);
  });

  it('one-sided with no principal wallet on file can never be signed', () => {
    const p2 = resolveSignerParties({ is_one_sided: true, principal_wallet: null });
    expect(canSignAs(p2, [], A, UNGATED).ok).toBe(false);
  });
});

describe('zero address', () => {
  it('is ignored in every slot', () => {
    const p = resolveSignerParties({
      principal_wallet: ZERO,
      parameters: { principal_agent_id: ZERO, agent_id: ZERO, provider_agent_id: ZERO },
    });
    expect(p.principal).toEqual([]);
    expect(p.counterparty).toEqual([]);
    const oneSided = resolveSignerParties({ is_one_sided: true, principal_wallet: ZERO });
    expect(oneSided.principal).toEqual([]);
    expect(canSignAs(oneSided, [], ZERO, UNGATED).ok).toBe(false);
  });

  it('is not a conflict between the two sides', () => {
    expect(sharedWalletBothSides({ principal_wallet: ZERO, parameters: { agent_id: ZERO } })).toBeNull();
  });
});

describe('principal_wallet equal to a counterparty wallet', () => {
  it('is dropped when no principal-side field names it, so the deployer can sign', () => {
    const p = resolveSignerParties({
      principal_wallet: B,
      parameters: { principal_agent_id: A, agent_id: B },
    });
    expect(p.principal).toEqual([A]);
    expect(p.counterparty).toEqual([B]);
    expect(canSignAs(p, [], A, UNGATED).ok).toBe(true);
    expect(missingSlots(p, [A, B])).toEqual([]);
  });

  it('with no principal-side field the principal slot opens to any wallet but the counterparty', () => {
    const p = resolveSignerParties({ principal_wallet: B, parameters: { agent_id: B } });
    expect(p.principal).toEqual([]);
    expect(canSignAs(p, [], B, UNGATED).ok).toBe(true); // fills the counterparty slot
    expect(canSignAs(p, [B], C, UNGATED).ok).toBe(true); // first other wallet takes the principal slot
    expect(canSignAs(p, [B], B, UNGATED).ok).toBe(false);
  });

  it('is kept when a principal-side field names the same wallet', () => {
    const p = resolveSignerParties({ principal_wallet: B, parameters: { principal_agent_id: B, agent_id: A } });
    expect(p.principal).toEqual([B]);
  });

  it('one-sided contracts keep it (the delegatee is not a signer)', () => {
    const p = resolveSignerParties({ is_one_sided: true, principal_wallet: B, parameters: { agent_id: B } });
    expect(p.principal).toEqual([B]);
  });
});

describe('sharedWalletBothSides', () => {
  it('finds principal_wallet reused as a counterparty wallet', () => {
    expect(sharedWalletBothSides({ principal_wallet: A, parameters: { provider_agent_id: A } })).toBe(A);
  });

  it('finds the same wallet in a principal field and a counterparty field', () => {
    expect(sharedWalletBothSides({ parameters: { consumer_agent_id: C, provider_agent_id: C } })).toBe(C);
  });

  it('is null for distinct wallets and for no wallets', () => {
    expect(sharedWalletBothSides({ principal_wallet: A, parameters: { provider_agent_id: B } })).toBeNull();
    expect(sharedWalletBothSides({ parameters: {} })).toBeNull();
    expect(sharedWalletBothSides({})).toBeNull();
  });
});

describe('one-sided principal slot without principal_wallet', () => {
  it('is the principal_agent_id authorizer, never open', () => {
    const p = resolveSignerParties({ is_one_sided: true, principal_wallet: null, parameters: { principal_agent_id: A, agent_id: B } });
    expect(p).toEqual({ oneSided: true, principal: [A], counterparty: [] });
    expect(canSignAs(p, [], A, UNGATED).ok).toBe(true);
    expect(canSignAs(p, [], B, UNGATED).ok).toBe(false);
  });

  it('principal_wallet wins over principal_agent_id; a zero authorizer leaves it unsignable', () => {
    expect(resolveSignerParties({ is_one_sided: true, principal_wallet: B, parameters: { principal_agent_id: A } }).principal).toEqual([B]);
    const none = resolveSignerParties({ is_one_sided: true, parameters: { principal_agent_id: ZERO } });
    expect(none.principal).toEqual([]);
    expect(canSignAs(none, [], A, UNGATED).ok).toBe(false);
  });
});

describe('canSignAs: who vouches for an open slot', () => {
  const D = '0x' + 'd'.repeat(40);
  const none = { creator: false, invite: false };
  const creator = { creator: true, invite: false };
  const invite = { creator: false, invite: true };
  const bothOpen: SignerParties = { oneSided: false, principal: [], counterparty: [] };
  const principalOpen: SignerParties = { oneSided: false, principal: [], counterparty: [B] };
  const counterpartyOpen: SignerParties = { oneSided: false, principal: [A], counterparty: [] };
  const declared: SignerParties = { oneSided: false, principal: [A], counterparty: [B] };

  it('an open principal slot needs the creator', () => {
    expect(canSignAs(principalOpen, [], C, none)).toEqual({ ok: false, open: ['principal', 'counterparty'], restricted: ['principal'] });
    expect(canSignAs(principalOpen, [], C, invite)).toMatchObject({ ok: false, restricted: ['principal'] });
    expect(canSignAs(principalOpen, [], C, creator)).toEqual({ ok: true, slot: 'principal' });
  });

  it('an open counterparty slot needs an invite, and the creator does not count', () => {
    expect(canSignAs(counterpartyOpen, [A], C, none)).toEqual({ ok: false, open: ['counterparty'], restricted: ['counterparty'] });
    expect(canSignAs(counterpartyOpen, [A], C, creator)).toMatchObject({ ok: false, restricted: ['counterparty'] });
    expect(canSignAs(counterpartyOpen, [A], C, invite)).toEqual({ ok: true, slot: 'counterparty' });
  });

  it('declared wallets need no authorization', () => {
    expect(canSignAs(declared, [], A, none)).toEqual({ ok: true, slot: 'principal' });
    expect(canSignAs(declared, [A], B, none)).toEqual({ ok: true, slot: 'counterparty' });
    expect(canSignAs(declared, [], C, creator)).toEqual({ ok: false, open: ['principal', 'counterparty'] });
    expect(canSignAs(principalOpen, [], B, none).ok).toBe(true); // the declared counterparty
  });

  it('both open: the creator takes principal, an invitee counterparty, neither is refused', () => {
    expect(canSignAs(bothOpen, [], C, creator)).toEqual({ ok: true, slot: 'principal' });
    expect(canSignAs(bothOpen, [], C, invite)).toEqual({ ok: true, slot: 'counterparty' });
    expect(canSignAs(bothOpen, [], C, { creator: true, invite: true })).toEqual({ ok: true, slot: 'principal' });
    expect(canSignAs(bothOpen, [], C, none)).toMatchObject({ ok: false, restricted: ['principal', 'counterparty'] });
  });

  it('a creator who already signed leaves only the counterparty slot, which needs an invite', () => {
    const placed = { [A]: 'principal' as const };
    expect(canSignAs(bothOpen, [A], C, creator, placed)).toMatchObject({ ok: false, restricted: ['counterparty'] });
    expect(canSignAs(bothOpen, [A], C, invite, placed)).toEqual({ ok: true, slot: 'counterparty' });
  });

  it('with the first signer on record as counterparty, a second invite holder cannot take the principal slot', () => {
    const placed = { [A]: 'counterparty' as const };
    expect(canSignAs(bothOpen, [A], C, invite, placed)).toMatchObject({ ok: false, open: ['principal'], restricted: ['principal'] });
    expect(canSignAs(bothOpen, [A], C, creator, placed)).toEqual({ ok: true, slot: 'principal' });
  });

  it('signatures with no slot on record fit whichever slot is free (signed before slots were recorded)', () => {
    expect(canSignAs(bothOpen, [A], C, invite)).toEqual({ ok: true, slot: 'counterparty' });
    expect(canSignAs(bothOpen, [A, C], D, creator)).toEqual({ ok: false, open: [] });
  });

  it('a wallet claimed by the other side, or that already signed, is refused without a hint', () => {
    expect(canSignAs({ ...principalOpen, counterparty: [B] }, [B], B, creator)).toEqual({ ok: false, open: ['principal'] });
    expect(canSignAs(bothOpen, [A], A, { creator: true, invite: true })).toEqual({ ok: false, open: ['principal'] });
  });

  it('a one-sided contract is unchanged: the principal is never open, and authorization does not open it', () => {
    const p2: SignerParties = { oneSided: true, principal: [A], counterparty: [] };
    expect(canSignAs(p2, [], A, none)).toEqual({ ok: true, slot: 'principal' });
    expect(canSignAs(p2, [], C, { creator: true, invite: true })).toEqual({ ok: false, open: ['principal'] });
    const nobody: SignerParties = { oneSided: true, principal: [], counterparty: [] };
    expect(canSignAs(nobody, [], A, { creator: true, invite: true })).toEqual({ ok: false, open: ['principal'] });
  });

  it('UNGATED answers party membership only', () => {
    expect(canSignAs(bothOpen, [], C, UNGATED).ok).toBe(true);
    expect(canSignAs(principalOpen, [], C, UNGATED).ok).toBe(true);
  });

  it('missingSlots, and so validity, ignores authorization', () => {
    expect(missingSlots(bothOpen, [A, C])).toEqual([]);
    expect(missingSlots(principalOpen, [C, B])).toEqual([]);
  });
});

describe('openSlots', () => {
  it('lists the slots with no declared wallet; a one-sided contract has none', () => {
    expect(openSlots({ oneSided: false, principal: [], counterparty: [] })).toEqual(['principal', 'counterparty']);
    expect(openSlots({ oneSided: false, principal: [A], counterparty: [] })).toEqual(['counterparty']);
    expect(openSlots({ oneSided: false, principal: [A], counterparty: [B] })).toEqual([]);
    expect(openSlots({ oneSided: true, principal: [], counterparty: [] })).toEqual([]);
  });
});

describe('principalWalletFromKey', () => {
  const KEY = '0x' + 'AB'.repeat(20);
  it('brings the account wallet, lowercased, to a contract that names no principal-side wallet', () => {
    expect(principalWalletFromKey({ parameters: {} }, KEY)).toBe(KEY.toLowerCase());
    expect(principalWalletFromKey({ parameters: { executor_agent_id: B } }, KEY)).toBe(KEY.toLowerCase());
  });
  it('yields to a principal_wallet that was sent and to any principal-side wallet in the parameters', () => {
    expect(principalWalletFromKey({ principal_wallet: A, parameters: {} }, KEY)).toBeNull();
    expect(principalWalletFromKey({ parameters: { requester_agent_id: A } }, KEY)).toBeNull();
    expect(principalWalletFromKey({ parameters: { consumer_agent_id: A } }, KEY)).toBeNull();
  });
  it('never puts one wallet on both sides', () => {
    expect(principalWalletFromKey({ parameters: { executor_agent_id: KEY } }, KEY)).toBeNull();
    expect(principalWalletFromKey({ parameters: { agent_id: KEY.toLowerCase() } }, KEY)).toBeNull();
  });
  it('ignores a wallet that is not usable', () => {
    expect(principalWalletFromKey({ parameters: {} }, null)).toBeNull();
    expect(principalWalletFromKey({ parameters: {} }, undefined)).toBeNull();
    expect(principalWalletFromKey({ parameters: {} }, ZERO)).toBeNull();
    expect(principalWalletFromKey({ parameters: {} }, 'not-a-wallet')).toBeNull();
  });
});

describe('missingSlots with recorded slots', () => {
  const D = '0x' + 'd'.repeat(40);
  const bothOpen: SignerParties = { oneSided: false, principal: [], counterparty: [] };

  it('two rows recorded for the counterparty side never complete the contract', () => {
    expect(missingSlots(bothOpen, [A, B], { [A]: 'counterparty', [B]: 'counterparty' })).toEqual(['principal']);
  });

  it('a recorded row fills its own slot; rows without one fill whatever is left', () => {
    expect(missingSlots(bothOpen, [A, B], { [A]: 'counterparty' })).toEqual([]);
    expect(missingSlots(bothOpen, [A, B], { [A]: 'principal', [B]: 'counterparty' })).toEqual([]);
    expect(missingSlots(bothOpen, [A], { [A]: 'counterparty' })).toEqual(['principal']);
  });

  it('without recorded slots it counts exactly as before (validity)', () => {
    expect(missingSlots(bothOpen, [A, B])).toEqual([]);
    expect(missingSlots(bothOpen, [A])).toEqual(['principal']);
  });

  it('a recorded row for a slot the contract does not have fills nothing', () => {
    const p2: SignerParties = { oneSided: true, principal: [C], counterparty: [] };
    expect(missingSlots(p2, [D], { [D]: 'counterparty' })).toEqual(['principal']);
  });
});
