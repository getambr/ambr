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
  client_draft_id: z.string().min(1).max(128).optional(),
  // Deployer's connected wallet at contract-creation time. Populated by
  // DeployChat.tsx from `useWalletConnection()` state. Stored on the contract
  // row as `principal_wallet` so the sender can sign their own contract via
  // the reader portal (sign endpoint matches against this field). Optional —
  // some users may deploy via API key without a wallet; the principal slot
  // is then filled from the creating account's wallet or left open
  // (lib/contract/same-wallet.ts), never from `principal_declaration.agent_id`,
  // which names the agent.
  principal_wallet: z.string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'principal_wallet must be a valid Ethereum address')
    .optional()
    .nullable(),
  // The spending level above which work done UNDER this contract needs a human.
  // Without this field the column could only be inherited from a parent that
  // already carried a threshold, and nothing would set the first one, so the
  // EU AI Act Article 14 path would be unreachable. Declaring it here is what
  // bootstraps the chain.
  oversight_threshold_usd: z.number()
    .positive('oversight_threshold_usd must be greater than zero')
    .optional()
    .nullable(),
});

export type CreateContractInput = z.input<typeof createContractSchema>;

export const activateKeySchema = z.object({
  email: z.email('Valid email required'),
  tx_hash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash')
    .optional(),
  // Enterprise is contact-only; it is never self-serve.
  tier: z.enum(['developer', 'startup', 'scale']),
});

export type ActivateKeyInput = z.input<typeof activateKeySchema>;
