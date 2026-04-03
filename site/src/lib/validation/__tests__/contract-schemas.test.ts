import { describe, it, expect } from 'vitest';
import {
  principalDeclarationSchema,
  createContractSchema,
  activateKeySchema,
} from '../contract-schemas';

describe('principalDeclarationSchema', () => {
  it('accepts valid company declaration', () => {
    const result = principalDeclarationSchema.safeParse({
      agent_id: '0x1234567890abcdef1234567890abcdef12345678',
      principal_name: 'Acme Corp',
      principal_type: 'company',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid individual declaration', () => {
    const result = principalDeclarationSchema.safeParse({
      agent_id: 'agent-001',
      principal_name: 'Jane Doe',
      principal_type: 'individual',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty agent_id', () => {
    const result = principalDeclarationSchema.safeParse({
      agent_id: '',
      principal_name: 'Acme Corp',
      principal_type: 'company',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty principal_name', () => {
    const result = principalDeclarationSchema.safeParse({
      agent_id: '0x1234',
      principal_name: '',
      principal_type: 'company',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid principal_type', () => {
    const result = principalDeclarationSchema.safeParse({
      agent_id: '0x1234',
      principal_name: 'Acme Corp',
      principal_type: 'government',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    const result = principalDeclarationSchema.safeParse({
      agent_id: '0x1234',
    });
    expect(result.success).toBe(false);
  });
});

describe('createContractSchema', () => {
  const validInput = {
    template: 'd1-general-auth',
    parameters: {
      principal_name: 'Acme Corp',
      agent_id: '0x1234567890abcdef1234567890abcdef12345678',
      scope: 'procurement of cloud services',
      spending_limit_per_tx: 1000,
      spending_limit_monthly: 10000,
      duration_months: 12,
      governing_law: 'Singapore',
      categories: ['cloud', 'saas'],
    },
    principal_declaration: {
      agent_id: '0x1234567890abcdef1234567890abcdef12345678',
      principal_name: 'Acme Corp',
      principal_type: 'company',
    },
  };

  it('accepts valid contract creation input', () => {
    const result = createContractSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts input with optional amendment fields', () => {
    const result = createContractSchema.safeParse({
      ...validInput,
      parent_contract_hash: 'a'.repeat(64),
      amendment_type: 'amendment',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty template slug', () => {
    const result = createContractSchema.safeParse({
      ...validInput,
      template: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid amendment_type', () => {
    const result = createContractSchema.safeParse({
      ...validInput,
      amendment_type: 'revision',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing principal_declaration', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { principal_declaration: _omitted, ...rest } = validInput;
    const result = createContractSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('accepts parameters as record of any values', () => {
    const result = createContractSchema.safeParse({
      ...validInput,
      parameters: {
        name: 'test',
        count: 42,
        nested: { key: 'value' },
        list: [1, 2, 3],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('activateKeySchema', () => {
  it('accepts valid activation input', () => {
    const result = activateKeySchema.safeParse({
      email: 'user@example.com',
      tx_hash: '0x' + 'a'.repeat(64),
      tier: 'startup',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all tier levels', () => {
    for (const tier of ['developer', 'startup', 'scale', 'enterprise']) {
      const result = activateKeySchema.safeParse({
        email: 'user@example.com',
        tx_hash: '0x' + 'b'.repeat(64),
        tier,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid email', () => {
    const result = activateKeySchema.safeParse({
      email: 'not-an-email',
      tx_hash: '0x' + 'a'.repeat(64),
      tier: 'startup',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid tx_hash format', () => {
    const cases = [
      'not-a-hash',
      '0x' + 'g'.repeat(64), // invalid hex
      '0x' + 'a'.repeat(63), // too short
      '0x' + 'a'.repeat(65), // too long
      'a'.repeat(64), // missing 0x prefix
    ];
    for (const tx_hash of cases) {
      const result = activateKeySchema.safeParse({
        email: 'user@example.com',
        tx_hash,
        tier: 'startup',
      });
      expect(result.success).toBe(false);
    }
  });

  it('rejects old tier names', () => {
    for (const tier of ['alpha', 'starter', 'builder', 'premium']) {
      const result = activateKeySchema.safeParse({
        email: 'user@example.com',
        tx_hash: '0x' + 'a'.repeat(64),
        tier,
      });
      expect(result.success).toBe(false);
    }
  });
});
