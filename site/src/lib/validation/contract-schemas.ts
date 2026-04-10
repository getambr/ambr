import { z } from 'zod/v4';

export const principalDeclarationSchema = z.object({
  agent_id: z.string()
    .min(1, 'Agent ID is required')
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Agent ID must be a valid Ethereum address (0x + 40 hex chars)'),
  principal_name: z.string()
    .min(1, 'Principal name is required')
    .max(200, 'Principal name too long'),
  principal_type: z.enum(['company', 'individual']),
});

export const createContractSchema = z.object({
  template: z.string().min(1, 'Template slug is required').max(50),
  parameters: z.record(z.string(), z.unknown()),
  principal_declaration: principalDeclarationSchema,
  parent_contract_hash: z.string()
    .regex(/^[a-f0-9]{64}$/, 'Parent contract hash must be a valid SHA-256 hex string')
    .optional(),
  amendment_type: z.enum(['original', 'amendment', 'extension']).optional(),
  visibility: z.enum(['private', 'metadata_only', 'public', 'encrypted']).optional(),
  publish_to: z.array(z.string()).optional(),
  require_zk_identity: z.boolean().optional(),
});

export type CreateContractInput = z.input<typeof createContractSchema>;

export const activateKeySchema = z.object({
  email: z.email('Valid email required'),
  tx_hash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash')
    .optional(),
  tier: z.enum(['developer', 'startup', 'scale', 'enterprise']),
});

export type ActivateKeyInput = z.input<typeof activateKeySchema>;
