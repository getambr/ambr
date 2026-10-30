import { normalizeWallet } from '@/lib/contract/signers';
import { normalizeLimitParams } from './optional-limits';

/**
 * The POST /api/v1/contracts body the chat deploy flow sends. Pure, so the
 * wallet mapping can be tested without rendering the component.
 *
 * Two wallets matter and they are different entities:
 *
 *   principal_wallet                 the deploying user's own signing wallet. The
 *                                    server stores it as contracts.principal_wallet
 *                                    and only that wallet may sign the principal slot.
 *   principal_declaration.agent_id   the AGENT's wallet. The server never treats it
 *                                    as the principal: approval, signing and the
 *                                    account wallets all exclude it.
 *
 * Putting the user's own wallet in agent_id would make the server refuse the
 * principal wherever it excludes the agent (approval above the oversight
 * threshold), and copying a counterparty wallet into principal_wallet would put
 * one wallet on both sides of a contract nobody could countersign.
 */

/** Template slug -> parameter that holds the deploying user's own wallet. */
export const OWN_WALLET_FIELD_BY_TEMPLATE: Record<string, string> = {
  'a1-service-purchase': 'consumer_agent_id',
  'd1-general-auth': 'principal_agent_id',
  'c1-api-access': 'buyer_agent_id',
  // P2 reuses the D1 principal_agent_id slot: the user's own wallet is what
  // signs the one-sided Power of Attorney.
  'p2-power-of-attorney': 'principal_agent_id',
  // A2A: the user sets up the deal as the requester.
  'c3-task-execution': 'requester_agent_id',
};

/**
 * Template slug -> parameter that holds the other wallet: the AI agent for the
 * delegation templates, the counterparty's agent for the commerce ones. These
 * are wallets the user must provide, never filled from the connected wallet.
 * C1 has none: its buyer_agent_id is the user's own wallet.
 */
export const AGENT_WALLET_FIELD_BY_TEMPLATE: Record<string, string> = {
  'a1-service-purchase': 'provider_agent_id',
  'd1-general-auth': 'agent_id',
  'p2-power-of-attorney': 'agent_id',
  'c3-task-execution': 'executor_agent_id',
};

/**
 * Templates whose agent wallet is the principal's own agent, and so the only
 * ones that declare it as principal_declaration.agent_id. On a commerce
 * template the other wallet is a counterparty, and declaring it as the
 * principal's agent would write into the hashed contract that the counterparty
 * acts for the principal.
 */
const DECLARES_AGENT = new Set(['d1-general-auth', 'p2-power-of-attorney']);

/** Own-wallet parameters of templates the map above does not know, in lookup order. */
const FALLBACK_OWN_WALLET_FIELDS = [
  'principal_agent_id',
  'consumer_agent_id',
  'buyer_agent_id',
  'client_agent_id',
  'requester_agent_id',
];

/** Satisfies the schema's address check when no agent wallet is named; the server ignores it (normalizeWallet). */
export const NO_AGENT_WALLET = '0x0000000000000000000000000000000000000000';

/** The trimmed address when v is a usable wallet (an address, not the zero address), else null. */
function usableWallet(v: unknown): string | null {
  return normalizeWallet(v) ? String(v).trim() : null;
}

export interface DeployRequestInput {
  template: string;
  params: Record<string, unknown>;
  /** The connected wallet; the principal's only when the form names none. */
  effectiveWallet?: string | null;
  userEmail?: string | null;
  draftId: string | null;
}

/** The wallet the form names for the user's own side, when it is a usable address. */
function ownWalletParam(template: string, params: Record<string, unknown>): string | null {
  const ownField = OWN_WALLET_FIELD_BY_TEMPLATE[template];
  const candidates = ownField ? [params[ownField]] : FALLBACK_OWN_WALLET_FIELDS.map((f) => params[f]);
  return candidates.map(usableWallet).find((w) => w !== null) ?? null;
}

/**
 * Shown by the Deploy button when the contract will be signed by a wallet other
 * than the connected one (the form's own-wallet field names a different
 * address). Null when they match, or when no wallet is connected to differ from.
 */
export function signerNotice(
  template: string,
  params: Record<string, unknown>,
  effectiveWallet: string | null | undefined,
): string | null {
  const own = ownWalletParam(template, params);
  const connected = usableWallet(effectiveWallet);
  if (!own || !connected || own.toLowerCase() === connected.toLowerCase()) return null;
  return `This contract will be signed by ${own.slice(0, 6)}…${own.slice(-4)}, not your connected wallet.`;
}

export function buildDeployRequestBody(input: DeployRequestInput) {
  const { template, params, effectiveWallet, userEmail, draftId } = input;

  const principalWallet = ownWalletParam(template, params) ?? usableWallet(effectiveWallet) ?? null;

  const agentField = AGENT_WALLET_FIELD_BY_TEMPLATE[template];
  const agentId =
    (DECLARES_AGENT.has(template) && agentField ? usableWallet(params[agentField]) : null) ?? NO_AGENT_WALLET;

  const principalName =
    (params.principal_name as string) ||
    (params.consumer_name as string) ||
    (params.buyer_name as string) ||
    userEmail ||
    'Ambr User';
  const principalType = (params.principal_type as string) === 'company' ? 'company' : 'individual';

  return {
    template,
    // Caps reach the contract as numbers; an answer that is not an amount is left out.
    parameters: normalizeLimitParams(params),
    principal_declaration: {
      principal_name: principalName,
      principal_type: principalType,
      agent_id: agentId,
    },
    principal_wallet: principalWallet,
    visibility: 'private' as const,
    client_draft_id: draftId,
  };
}
