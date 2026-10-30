import { describe, it, expect } from 'vitest';
import {
  inferExplicitTemplate,
  inferTemplate,
  inferTemplateFromParams,
  notReadyQuestion,
  resolveTemplate,
  validChatTemplate,
} from '../infer-template';

const user = (content: string) => ({ role: 'user' as const, content });

// A first message that describes a one-sided grant in plain terms and names none of the template words.
const FIRST_MESSAGE = user(
  'I want to authorize my AI agent to buy API credits for me, up to 50 USD per month, for 1 month. ' +
    'Principal: Example Co, company, registration TEST-0001, legal address 1 Example Street, Riga, Latvia. ' +
    'My wallet: 0x1111111111111111111111111111111111111111. ' +
    'Agent wallet: 0x2222222222222222222222222222222222222222. ' +
    'Agent type autonomous. Jurisdiction Latvia. No per-transaction limit.',
);

describe('inferTemplate', () => {
  it('picks the power of attorney from a plain first message with no template words', () => {
    expect(inferTemplate([FIRST_MESSAGE])).toBe('p2-power-of-attorney');
  });

  it('honours an explicit mention', () => {
    expect(inferTemplate([user('Use the Power of Attorney (P2) template')])).toBe('p2-power-of-attorney');
    expect(inferTemplate([user('an agent to agent task')])).toBe('c3-task-execution');
    expect(inferTemplate([user('a delegation please')])).toBe('d1-general-auth');
  });

  it('picks nothing for a greeting', () => {
    expect(inferTemplate([user('hi')])).toBeNull();
  });

  it('picks nothing when cues point at different templates', () => {
    expect(inferTemplate([user('authorize my AI agent to buy things, with a counterparty who co-signs')])).toBeNull();
  });

  it('reads a counterparty exchange as a delegation', () => {
    expect(inferTemplate([user('a bilateral agreement with a counterparty')])).toBe('d1-general-auth');
  });

  it('does not read a question about the product as a description of the contract', () => {
    expect(inferTemplate([user('What categories of contracts do you support?')])).toBeNull();
    expect(inferTemplate([user('how do I co-sign?')])).toBeNull();
    expect(inferTemplate([user('Can my agent act on my behalf?')])).toBeNull();
    expect(inferTemplate([user('Does a counterparty have to sign?')])).toBeNull();
  });

  it('still reads allowed categories in a statement as a delegation', () => {
    expect(inferTemplate([user('The allowed categories are travel and software.')])).toBe('d1-general-auth');
  });

  it('ignores the assistant side', () => {
    expect(inferTemplate([{ role: 'assistant', content: 'Shall I draft a power of attorney?' }])).toBeNull();
  });

  it('falls back to the extracted parameters only when the wording gives no signal', () => {
    expect(inferTemplate([user('here you go')], { principal_name: 'X', agent_id: '0x1' })).toBe('p2-power-of-attorney');
    expect(inferTemplate([user('here you go')], { principal_name: 'X', categories: 'travel' })).toBe('d1-general-auth');
    expect(
      inferTemplate([user('authorize my agent, with a counterparty')], { principal_name: 'X' }),
    ).toBeNull();
  });
});

describe('inferExplicitTemplate', () => {
  it('locks only on an outright mention, not on wording cues', () => {
    expect(inferExplicitTemplate([FIRST_MESSAGE])).toBeNull();
    expect(inferExplicitTemplate([user('Can my agent act on my behalf?')])).toBeNull();
    expect(inferExplicitTemplate([user('I want a power of attorney')])).toBe('p2-power-of-attorney');
  });
});

describe('inferTemplateFromParams', () => {
  it('maps parameter sets to templates', () => {
    expect(inferTemplateFromParams({ requester_name: 'A' })).toBe('c3-task-execution');
    expect(inferTemplateFromParams({ principal_name: 'A' })).toBe('p2-power-of-attorney');
    expect(inferTemplateFromParams({ principal_name: 'A', categories: 'x' })).toBe('d1-general-auth');
    expect(inferTemplateFromParams({ principal_agent_id: '0x1' })).toBeNull();
    expect(inferTemplateFromParams({})).toBeNull();
  });
});

describe('validChatTemplate', () => {
  it('accepts only templates the chat can create', () => {
    expect(validChatTemplate('p2-power-of-attorney')).toBe('p2-power-of-attorney');
    expect(validChatTemplate('p2')).toBeNull();
    expect(validChatTemplate(undefined)).toBeNull();
    expect(validChatTemplate(7)).toBeNull();
  });
});

describe('resolveTemplate', () => {
  const messages = [FIRST_MESSAGE];

  it('keeps a template that is already locked over every other signal', () => {
    expect(
      resolveTemplate({ templateSoFar: 'd1-general-auth', rawTemplate: 'p2-power-of-attorney', messages }),
    ).toBe('d1-general-auth');
  });

  it('keeps a valid model template', () => {
    expect(resolveTemplate({ templateSoFar: null, rawTemplate: 'c3-task-execution', messages })).toBe('c3-task-execution');
  });

  it('discards a model template that is not a real one and infers instead', () => {
    expect(resolveTemplate({ templateSoFar: null, rawTemplate: 'p2', messages })).toBe('p2-power-of-attorney');
  });

  it('infers when the model gave none', () => {
    expect(resolveTemplate({ templateSoFar: null, rawTemplate: null, messages })).toBe('p2-power-of-attorney');
  });

  it('stays null when nothing points at a template', () => {
    expect(resolveTemplate({ templateSoFar: null, rawTemplate: null, messages: [user('hi')] })).toBeNull();
  });
});

describe('notReadyQuestion', () => {
  it('asks about the missing field first', () => {
    expect(notReadyQuestion({ nextField: 'agent_type', template: null })).toBe("One more thing — what's the agent type?");
  });

  it('asks which template when none is locked, not for the next detail', () => {
    const q = notReadyQuestion({ nextField: undefined, template: null });
    expect(q).toContain('P2');
    expect(q).not.toContain('next detail');
  });

  it('nudges for the next detail only once a template is locked', () => {
    expect(notReadyQuestion({ nextField: undefined, template: 'p2-power-of-attorney' })).toContain('next detail');
  });
});
