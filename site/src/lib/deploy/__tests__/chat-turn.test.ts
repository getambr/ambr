import { describe, it, expect } from 'vitest';
import { mergeClassifiedTurn } from '../chat-turn';
import { notReadyQuestion } from '../infer-template';

const OWN = '0x' + '1'.repeat(40);
const AGENT = '0x' + '2'.repeat(40);
const BROWSER = '0x' + '3'.repeat(40);

const FIRST_MESSAGE = {
  role: 'user' as const,
  content:
    'I want to authorize my AI agent to buy API credits for me, up to 50 USD per month, for 1 month. ' +
    `Principal: Example Co, company. My wallet: ${OWN}. Agent wallet: ${AGENT}. ` +
    'Agent type autonomous. Jurisdiction Latvia. No per-transaction limit.',
};

// What the model returned for that message: parameters, no template, a "none" cap.
const MODEL_PARAMS = {
  principal_name: 'Example Co',
  principal_type: 'company',
  agent_type: 'autonomous',
  spending_limit_per_tx: 'none',
  spending_limit_monthly: 50,
  duration_months: 1,
  governing_law: 'Latvia',
};

function turn(over: Partial<Parameters<typeof mergeClassifiedTurn>[0]> = {}) {
  return mergeClassifiedTurn({
    messages: [FIRST_MESSAGE],
    templateSoFar: null,
    rawTemplate: undefined,
    confidence: 0.8,
    confidenceFloor: 0.4,
    extractedSoFar: {},
    newExtracted: MODEL_PARAMS,
    confirmedFields: new Set(),
    ...over,
  });
}

describe('mergeClassifiedTurn', () => {
  it('locks the power of attorney when the model returned parameters but no template', () => {
    const { template } = turn();
    expect(template).toBe('p2-power-of-attorney');
  });

  it('locks it when the model returned a template that is not a real one', () => {
    expect(turn({ rawTemplate: 'p2' }).template).toBe('p2-power-of-attorney');
  });

  it('never replaces a locked template', () => {
    expect(turn({ templateSoFar: 'd1-general-auth', rawTemplate: 'p2-power-of-attorney' }).template).toBe('d1-general-auth');
  });

  it('takes the wallets the user typed when the model extracted neither', () => {
    const { merged } = turn();
    expect(merged.principal_agent_id).toBe(OWN);
    expect(merged.agent_id).toBe(AGENT);
  });

  it('keeps a wallet the user confirmed through a UI control', () => {
    const { merged } = turn({
      extractedSoFar: { principal_agent_id: BROWSER },
      newExtracted: { ...MODEL_PARAMS, principal_agent_id: OWN },
      confirmedFields: new Set(['principal_agent_id']),
    });
    expect(merged.principal_agent_id).toBe(BROWSER);
  });

  it('stores a cap the user declined as absent and a cap with an amount as a number', () => {
    const { merged } = turn();
    expect('spending_limit_per_tx' in merged).toBe(false);
    expect(merged.spending_limit_monthly).toBe(50);
  });

  it('ignores the model parameters below the confidence floor', () => {
    const { template, merged } = turn({ confidence: 0.2, newExtracted: MODEL_PARAMS });
    expect(merged.principal_name).toBeUndefined();
    // The wording alone still identifies the template.
    expect(template).toBe('p2-power-of-attorney');
  });

  it('leaves the template null when nothing identifies one, so the template question is asked', () => {
    const { template } = turn({ messages: [{ role: 'user', content: 'ok' }], newExtracted: { foo: 'bar' } });
    expect(template).toBeNull();
    expect(notReadyQuestion({ nextField: undefined, template })).not.toContain('next detail');
  });
});

describe('mergeClassifiedTurn wallet sources', () => {
  it('ignores wallets in the intent the assistant handed over', () => {
    const handed = { role: 'user' as const, content: FIRST_MESSAGE.content, fromModel: true };
    const { merged } = turn({ messages: [handed] });
    expect(merged.principal_agent_id).toBeUndefined();
    expect(merged.agent_id).toBeUndefined();
  });

  it('still takes a wallet the user typed after a handed-over intent', () => {
    const handed = { role: 'user' as const, content: FIRST_MESSAGE.content, fromModel: true };
    const { merged } = turn({ messages: [handed, { role: 'user', content: `my wallet: ${BROWSER}` }] });
    expect(merged.principal_agent_id).toBe(BROWSER);
    expect(merged.agent_id).toBeUndefined();
  });

  it('lets a later correction replace the wallet an earlier message stated', () => {
    const first = turn();
    const { merged } = turn({
      messages: [FIRST_MESSAGE, { role: 'user', content: `use ${BROWSER} as my wallet` }],
      extractedSoFar: first.merged,
      newExtracted: {},
    });
    expect(merged.principal_agent_id).toBe(BROWSER);
    expect(merged.agent_id).toBe(AGENT);
  });
});
