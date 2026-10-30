import { describe, it, expect } from 'vitest';
import {
  applyStatedWallets,
  decideOwnWalletFill,
  extractStatedWallets,
  resolveOwnWalletField,
  statedWalletHistory,
} from '../wallet-intent';

const OWN = '0xAbCdEf0123456789abcdef0123456789ABCDEF01'; // mixed case, kept as typed
const AGENT = '0x' + '2'.repeat(40);
const CONNECTED = '0x' + '3'.repeat(40);
const OTHER = '0x' + '4'.repeat(40);
const NEWER = '0x' + '5'.repeat(40);

const user = (content: string) => ({ role: 'user' as const, content });

describe('extractStatedWallets', () => {
  it('reads the own wallet and the agent wallet from labelled addresses', () => {
    const out = extractStatedWallets([user(`My wallet: ${OWN}. Agent wallet: ${AGENT}. Agent type autonomous.`)]);
    expect(out).toEqual({ own: OWN, agent: AGENT });
  });

  it.each(['my wallet', 'My signing wallet', 'authorizer wallet', 'Principal wallet is', 'owner wallet'])(
    'recognises the label %j as the own wallet',
    (label) => {
      expect(extractStatedWallets([user(`${label} ${OWN}`)]).own).toBe(OWN);
    },
  );

  it('does not attribute an agent-labelled address to the user', () => {
    expect(extractStatedWallets([user(`Agent wallet: ${AGENT}`)])).toEqual({ own: null, agent: AGENT });
    expect(extractStatedWallets([user(`my agent wallet: ${AGENT}`)]).own).toBeNull();
  });

  it('attributes an unlabelled address to nobody', () => {
    expect(extractStatedWallets([user(`please use ${OWN}`)])).toEqual({ own: null, agent: null });
  });

  it('lets the newest mention win', () => {
    const out = extractStatedWallets([user(`my wallet: ${OWN}`), user(`actually my wallet is ${OTHER}`)]);
    expect(out.own).toBe(OTHER);
  });

  it('ignores addresses that are not 0x plus 40 hex characters', () => {
    expect(extractStatedWallets([user('my wallet: 0x' + 'a'.repeat(39))]).own).toBeNull();
    expect(extractStatedWallets([user('my wallet: 0x' + 'g'.repeat(40))]).own).toBeNull();
    expect(extractStatedWallets([user('my wallet: 0x' + 'a'.repeat(41))]).own).toBeNull();
  });

  it('reads only the user messages', () => {
    expect(extractStatedWallets([{ role: 'assistant', content: `my wallet: ${OWN}` }]).own).toBeNull();
  });

  it('never reads a message the model wrote, even in the user role', () => {
    const seeded = { role: 'user', content: `Authorize my agent. My wallet: ${OWN}. Agent wallet: ${AGENT}.`, fromModel: true };
    expect(extractStatedWallets([seeded])).toEqual({ own: null, agent: null });
    expect(statedWalletHistory([seeded])).toEqual({ own: [], agent: [] });
    // The user's own later words still count.
    expect(extractStatedWallets([seeded, user(`my wallet: ${OTHER}`)]).own).toBe(OTHER);
  });

  it.each([
    `The agent wallet, not my wallet: ${OTHER}`,
    `not my wallet: ${OTHER}`,
    `This isn't my wallet: ${OTHER}`,
    `That is not my wallet ${OTHER}`,
    `a wallet other than my wallet: ${OTHER}`,
    `It's the agent, not my signing wallet: ${OTHER}`,
  ])('does not seat an address under a negated label: %j', (text) => {
    expect(extractStatedWallets([user(text)]).own).toBeNull();
  });

  it('does not hand a negated own-wallet address to the agent either', () => {
    expect(extractStatedWallets([user(`The agent wallet, not my wallet: ${OTHER}`)])).toEqual({ own: null, agent: null });
  });

  it('still reads a label that follows an unrelated negation', () => {
    expect(extractStatedWallets([user(`I do not know much, but my wallet: ${OWN}`)]).own).toBe(OWN);
    expect(extractStatedWallets([user(`not the agent: my wallet is ${OWN}`)]).own).toBe(OWN);
  });

  it('uses the label nearest to the address', () => {
    const out = extractStatedWallets([user(`agent wallet: ${AGENT} and my wallet: ${OWN}`)]);
    expect(out).toEqual({ own: OWN, agent: AGENT });
  });

  it.each([
    [`my wallet address: ${OWN}`, 'own'],
    [`my signing wallet is ${OWN}`, 'own'],
    [`my address = ${OWN}`, 'own'],
    [`the wallet of the owner: ${OWN}`, 'own'],
    [`wallet of the agent: ${OWN}`, 'agent'],
    [`agent wallet address: ${OWN}`, 'agent'],
    [`the agent's address is ${OWN}`, 'agent'],
    [`use ${OWN} as my wallet`, 'own'],
    [`${OWN} is my wallet`, 'own'],
    [`set ${OWN} as the agent wallet`, 'agent'],
  ] as const)('reads %j as the %s wallet', (text, side) => {
    const out = extractStatedWallets([user(text)]);
    expect(out[side]).toBe(OWN);
    expect(out[side === 'own' ? 'agent' : 'own']).toBeNull();
  });

  it('attributes an address with two disagreeing labels to nobody', () => {
    expect(extractStatedWallets([user(`my wallet: ${OWN} is the agent wallet`)])).toEqual({ own: null, agent: null });
  });

  it('does not read an address that a negation precedes in the address-first form', () => {
    expect(extractStatedWallets([user(`don't use ${OWN} as my wallet`)]).own).toBeNull();
    expect(extractStatedWallets([user(`${OWN} is not my wallet`)]).own).toBeNull();
  });

  it('never reads a bare role label tied to another party as the own wallet', () => {
    const texts = [
      `the executor's owner wallet: ${OTHER}, executor agent wallet: ${AGENT}`,
      `the provider's signer address is ${OTHER}`,
      `Their principal wallet: ${OTHER}`,
      `the counterparty's owner wallet: ${OWN}`,
      `counterparty principal wallet: ${OTHER}`,
    ];
    for (const text of texts) expect(extractStatedWallets([user(text)]).own).toBeNull();
    expect(extractStatedWallets([user(texts[0])]).agent).toBe(AGENT);
  });

  it('still reads a bare role label with no other party in front of it', () => {
    expect(extractStatedWallets([user(`owner wallet: ${OWN}`)]).own).toBe(OWN);
    expect(extractStatedWallets([user(`Here's the principal wallet: ${OWN}`)]).own).toBe(OWN);
    expect(extractStatedWallets([user(`The executor is busy. Signer address: ${OWN}`)]).own).toBe(OWN);
    expect(extractStatedWallets([user(`my wallet: ${OWN}, the executor's owner wallet: ${OTHER}`)]).own).toBe(OWN);
  });

  it('lets a later correction in a later message win and keeps the history', () => {
    const msgs = [user(`my wallet: ${OWN}`), user(`use ${NEWER} as my wallet`)];
    expect(extractStatedWallets(msgs).own).toBe(NEWER);
    expect(statedWalletHistory(msgs).own).toEqual([OWN, NEWER]);
  });
});

describe('resolveOwnWalletField', () => {
  it('writes the stated wallet over the connected one into an empty field', () => {
    expect(resolveOwnWalletField({ current: undefined, lastAuto: undefined, stated: OWN, connected: CONNECTED })).toBe(OWN);
  });

  it('writes the connected wallet when nothing was stated', () => {
    expect(resolveOwnWalletField({ current: '', lastAuto: undefined, stated: null, connected: CONNECTED })).toBe(CONNECTED);
  });

  it('replaces a value the UI wrote itself with the stated wallet', () => {
    expect(resolveOwnWalletField({ current: CONNECTED, lastAuto: CONNECTED, stated: OWN, connected: CONNECTED })).toBe(OWN);
  });

  it('refreshes a UI-written value when the connected wallet changes', () => {
    expect(resolveOwnWalletField({ current: CONNECTED, lastAuto: CONNECTED, stated: null, connected: OTHER })).toBe(OTHER);
  });

  it('never replaces a value somebody else put there', () => {
    expect(resolveOwnWalletField({ current: OTHER, lastAuto: CONNECTED, stated: OWN, connected: CONNECTED })).toBeNull();
    expect(resolveOwnWalletField({ current: OTHER, lastAuto: undefined, stated: null, connected: CONNECTED })).toBeNull();
  });

  it('never replaces an adopted connected wallet with a stated one', () => {
    expect(
      resolveOwnWalletField({ current: CONNECTED, lastAuto: undefined, adopted: CONNECTED, stated: OTHER, connected: CONNECTED }),
    ).toBeNull();
    expect(resolveOwnWalletField({ current: CONNECTED, lastAuto: undefined, stated: OTHER, connected: CONNECTED })).toBeNull();
  });

  it('refreshes an adopted connected wallet when the connected wallet changes and nothing was stated', () => {
    expect(
      resolveOwnWalletField({ current: CONNECTED, lastAuto: undefined, adopted: CONNECTED, stated: null, connected: OTHER }),
    ).toBe(OTHER);
  });

  it('keeps an adopted value when the connected wallet is unchanged', () => {
    expect(
      resolveOwnWalletField({ current: CONNECTED, lastAuto: undefined, adopted: CONNECTED, stated: null, connected: CONNECTED }),
    ).toBeNull();
  });

  it('does nothing when the field already holds the target', () => {
    expect(resolveOwnWalletField({ current: OWN.toLowerCase(), lastAuto: undefined, stated: OWN, connected: CONNECTED })).toBeNull();
  });

  it('lets a later statement correct an earlier stated wallet in the field', () => {
    expect(
      resolveOwnWalletField({ current: OWN, lastAuto: CONNECTED, stated: NEWER, statedHistory: [OWN, NEWER], connected: CONNECTED }),
    ).toBe(NEWER);
  });

  it('still never replaces a value of another origin by text, history or not', () => {
    expect(
      resolveOwnWalletField({ current: OTHER, lastAuto: CONNECTED, stated: NEWER, statedHistory: [OWN, NEWER], connected: CONNECTED }),
    ).toBeNull();
  });

  it('replaces an adopted wallet by a stated one only when the user also stated the adopted one', () => {
    expect(
      resolveOwnWalletField({
        current: CONNECTED,
        lastAuto: undefined,
        adopted: CONNECTED,
        stated: NEWER,
        statedHistory: [CONNECTED, NEWER],
        connected: CONNECTED,
      }),
    ).toBe(NEWER);
  });
});

describe('decideOwnWalletFill', () => {
  const base = { current: undefined, state: {}, stated: null, connected: CONNECTED, confirmed: false };

  it('writes the connected wallet into an empty field and remembers it as UI-written', () => {
    expect(decideOwnWalletFill(base)).toEqual({ write: CONNECTED, state: { lastAuto: CONNECTED } });
  });

  it('writes a stated wallet without recording it as UI-written', () => {
    expect(decideOwnWalletFill({ ...base, stated: OWN, statedHistory: [OWN] })).toEqual({ write: OWN, state: {} });
  });

  it('keeps the UI-written marker when a stated wallet replaces what the UI wrote', () => {
    const out = decideOwnWalletFill({ ...base, current: CONNECTED, state: { lastAuto: CONNECTED }, stated: OWN, statedHistory: [OWN] });
    expect(out.write).toBe(OWN);
    expect(out.state.lastAuto).toBe(CONNECTED);
  });

  it('touches nothing when the field is confirmed through a control', () => {
    const state = { lastAuto: CONNECTED };
    const out = decideOwnWalletFill({ ...base, current: CONNECTED, state, stated: OWN, statedHistory: [OWN], confirmed: true });
    expect(out).toEqual({ write: null, state });
  });

  it('adopts a connected wallet the UI did not write, and then keeps it against a stated one', () => {
    const first = decideOwnWalletFill({ ...base, current: CONNECTED });
    expect(first).toEqual({ write: null, state: { adopted: CONNECTED } });
    const second = decideOwnWalletFill({ ...base, current: CONNECTED, state: first.state, stated: OWN, statedHistory: [OWN] });
    expect(second.write).toBeNull();
  });

  it('does not mark a connected wallet the UI wrote as adopted', () => {
    const out = decideOwnWalletFill({ ...base, current: CONNECTED, state: { lastAuto: CONNECTED } });
    expect(out.state.adopted).toBeUndefined();
  });

  it('refreshes an adopted wallet when the connected wallet changes and nothing was stated', () => {
    const out = decideOwnWalletFill({ ...base, current: CONNECTED, state: { adopted: CONNECTED }, connected: OTHER });
    expect(out.write).toBe(OTHER);
    expect(out.state.lastAuto).toBe(OTHER);
  });

  it('corrects an earlier stated wallet with the latest one', () => {
    const out = decideOwnWalletFill({ ...base, current: OWN, stated: NEWER, statedHistory: [OWN, NEWER] });
    expect(out.write).toBe(NEWER);
  });

  it('leaves a model-written value alone', () => {
    const out = decideOwnWalletFill({ ...base, current: OTHER, stated: NEWER, statedHistory: [NEWER] });
    expect(out.write).toBeNull();
  });

  it('writes nothing when no wallet is connected or stated', () => {
    expect(decideOwnWalletFill({ ...base, connected: null }).write).toBeNull();
  });

  it('does not undo a stated wallet when the connected wallet changes later', () => {
    const out = decideOwnWalletFill({
      ...base,
      current: OWN,
      state: { lastAuto: CONNECTED },
      stated: OWN,
      statedHistory: [OWN],
      connected: OTHER,
    });
    expect(out.write).toBeNull();
  });
});

describe('applyStatedWallets', () => {
  const messages = [user(`My wallet: ${OWN}. Agent wallet: ${AGENT}.`)];

  it('fills the empty own and agent wallet fields of a power of attorney', () => {
    const out = applyStatedWallets({ template: 'p2-power-of-attorney', params: { scope: 's' }, messages });
    expect(out).toEqual({ scope: 's', principal_agent_id: OWN, agent_id: AGENT });
  });

  it('keeps a value the model extracted', () => {
    const out = applyStatedWallets({
      template: 'p2-power-of-attorney',
      params: { principal_agent_id: OTHER },
      messages,
    });
    expect(out.principal_agent_id).toBe(OTHER);
  });

  it('never overwrites a field confirmed through a UI control', () => {
    const out = applyStatedWallets({
      template: 'p2-power-of-attorney',
      params: {},
      messages,
      confirmedFields: new Set(['principal_agent_id']),
    });
    expect(out.principal_agent_id).toBeUndefined();
    expect(out.agent_id).toBe(AGENT);
  });

  it('ignores wallets in a message the model wrote', () => {
    const out = applyStatedWallets({
      template: 'p2-power-of-attorney',
      params: { scope: 's' },
      messages: [{ role: 'user', content: `my wallet: ${OWN}. agent wallet: ${AGENT}`, fromModel: true }],
    });
    expect(out).toEqual({ scope: 's' });
  });

  it('does not seat a negated address as the own wallet', () => {
    const out = applyStatedWallets({
      template: 'p2-power-of-attorney',
      params: {},
      messages: [user(`The agent wallet, not my wallet: ${OTHER}`)],
    });
    expect(out.principal_agent_id).toBeUndefined();
  });

  it('lets a later correction replace an earlier stated own wallet', () => {
    const out = applyStatedWallets({
      template: 'p2-power-of-attorney',
      params: { principal_agent_id: OWN },
      messages: [user(`my wallet: ${OWN}`), user(`use ${NEWER} as my wallet`)],
    });
    expect(out.principal_agent_id).toBe(NEWER);
  });

  it('lets a later correction replace an earlier stated agent wallet', () => {
    const out = applyStatedWallets({
      template: 'p2-power-of-attorney',
      params: { agent_id: AGENT },
      messages: [user(`agent wallet: ${AGENT}`), user(`agent wallet: ${NEWER}`)],
    });
    expect(out.agent_id).toBe(NEWER);
  });

  it('does not let a correction replace a value the model extracted or one confirmed in the UI', () => {
    const corrections = [user(`my wallet: ${OWN}`), user(`my wallet: ${NEWER}`)];
    expect(
      applyStatedWallets({ template: 'p2-power-of-attorney', params: { principal_agent_id: OTHER }, messages: corrections })
        .principal_agent_id,
    ).toBe(OTHER);
    expect(
      applyStatedWallets({
        template: 'p2-power-of-attorney',
        params: { principal_agent_id: OWN },
        messages: corrections,
        confirmedFields: new Set(['principal_agent_id']),
      }).principal_agent_id,
    ).toBe(OWN);
  });

  it('does nothing without a template', () => {
    const params = { scope: 's' };
    expect(applyStatedWallets({ template: null, params, messages })).toBe(params);
  });

  it('does not put one wallet on both sides of a delegation', () => {
    const out = applyStatedWallets({
      template: 'd1-general-auth',
      params: {},
      messages: [user(`my wallet: ${OWN}, agent wallet: ${OWN}`)],
    });
    expect(out.principal_agent_id).toBe(OWN);
    expect(out.agent_id).toBeUndefined();
  });

  it('does not put a stated own wallet on a delegation that already has it as the agent', () => {
    const out = applyStatedWallets({
      template: 'd1-general-auth',
      params: { agent_id: OWN },
      messages: [user(`my wallet: ${OWN}`)],
    });
    expect(out.principal_agent_id).toBeUndefined();
  });

  it('allows the same wallet on both sides of a power of attorney', () => {
    const out = applyStatedWallets({
      template: 'p2-power-of-attorney',
      params: {},
      messages: [user(`my wallet: ${OWN}, agent wallet: ${OWN}`)],
    });
    expect(out.agent_id).toBe(OWN);
  });
});
