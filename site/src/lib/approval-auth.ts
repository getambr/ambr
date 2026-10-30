import { verifyMessage } from 'ethers';

/**
 * Authorization for the principal-approval gates (EU AI Act Article 14).
 *
 * This lives in lib/ rather than inside the routes on purpose: the repo has no
 * API-route test harness, and the decision logic is where the security lives.
 * Kept pure — callers fetch the identity facts and pass them in — so a test can
 * exercise every branch with real ECDSA signatures and no database.
 *
 * The three failures this exists to prevent:
 *
 *  1. NO AUTHENTICATION AT ALL. A wallet branch that only checks that the
 *     signature matches the address the same caller supplied is a self-consistency
 *     check, not an authorization one: any freshly generated wallet would approve
 *     any contract, with no API key required. `contract_id` is public
 *     (reader URLs, emails, the unauthenticated GET /amendments), so such a gate
 *     is open to anyone who can read one.
 *
 *  2. REPLAY. The signed message must be inspected. A login signature harvested
 *     from WalletConnect or /sign would otherwise be a valid approval credential
 *     for every contract, forever. Binding follows the revoke route (revoke/route.ts:104-149),
 *     the one place in the codebase that already got this right: the message must
 *     name THIS contract's hash and state approval intent.
 *
 *  3. THE AGENT APPROVING ITSELF. See the comment on `entitledApprovers` — the
 *     obvious fix is wrong in a way that is invisible until you read
 *     contract-engine.ts.
 */

/** How strongly the approver was actually identified. Recorded in the audit row. */
export type ApprovalAssurance = 'wallet' | 'weak_api_key';

/** Identity facts about the contract and caller. The route fetches these. */
export interface ApprovalIdentity {
  /** Wallets proven to belong to the account owning the contract (account_wallets). */
  accountWallets: string[];
  /** contracts.principal_wallet — see entitledApprovers before trusting this. */
  contractPrincipalWallet: string | null;
  /** principal_declaration.agent_id — the AGENT. Never a valid approver. */
  agentWallet: string | null;
  /** api_keys.principal_wallet for the calling key, set only via a verified delegation. */
  callerDelegatedWallet: string | null;
}

export interface ApprovalAttempt {
  /** The contract's SHA-256, which the signed message must contain. */
  contractHash: string;
  /** contracts.api_key_id — the key that created this contract. */
  contractApiKeyId: string | null;
  /** Present when a valid API key was supplied. */
  caller: { keyId: string; email: string } | null;
  /** Present when the body carried a wallet signature. */
  signed: { walletAddress: string; signature: string; message: string } | null;
}

export type ApprovalDecision =
  | { ok: true; actor: string; assurance: ApprovalAssurance }
  | { ok: false; status: number; error: string; message: string };

const lc = (s: string | null | undefined): string => (s ?? '').toLowerCase();

/**
 * The signed message must be scoped to THIS contract and to approval.
 * Without the hash it is replayable across contracts; without the verb, an
 * ordinary wallet-connect login signature is a valid approval.
 */
export function bindsToApproval(message: string, contractHash: string): boolean {
  if (!message || !contractHash) return false;
  return message.includes(contractHash) && /approv/i.test(message);
}

/**
 * The set of addresses allowed to approve.
 *
 * Why `contracts.principal_wallet` is not simply trusted: `agent_id` is the
 * AGENT's wallet, a deliberately separate entity, and contract-engine.ts stores
 * only an explicit principal wallet, which a caller can still set to the
 * agent's address. Trusting the column then would hand the agent the authority
 * to approve its own work, which is precisely the hole this module closes. The
 * inequality against agentWallet is the discriminator.
 */
export function entitledApprovers(identity: ApprovalIdentity): Set<string> {
  const agent = lc(identity.agentWallet);
  const out = new Set<string>();

  const add = (candidate: string | null | undefined) => {
    const addr = lc(candidate);
    if (addr && addr !== agent) out.add(addr);
  };

  for (const wallet of identity.accountWallets) add(wallet);
  add(identity.contractPrincipalWallet);
  add(identity.callerDelegatedWallet);

  return out;
}

/** True when the account has at least one bound wallet that is not the agent. */
export function accountCanSign(identity: ApprovalIdentity): boolean {
  const agent = lc(identity.agentWallet);
  return identity.accountWallets.some((w) => lc(w) && lc(w) !== agent);
}

/**
 * Decide whether an approval attempt is authorized.
 *
 * Graceful, wallet-first cutover: an account that HAS a bound wallet must sign,
 * and its API key alone is refused. An account with no wallet yet may still
 * approve by key, recorded as `weak_api_key` so the audit trail does not
 * overstate what was proven.
 *
 * The residual risk that buys compatibility: for a wallet-less account, the
 * agent holding the creating key can still self-approve. That closes the moment
 * the account binds a wallet, and it is why the weak path is marked in both the
 * actor string and the assurance level rather than being silently equivalent.
 */
export function resolveApprovalCredential(
  attempt: ApprovalAttempt,
  identity: ApprovalIdentity,
): ApprovalDecision {
  // Wallet signature: the strong path, tried first so a signing caller is never
  // downgraded to the weak one just because it also sent an API key.
  if (attempt.signed) {
    const { walletAddress, signature, message } = attempt.signed;

    if (!bindsToApproval(message, attempt.contractHash)) {
      return {
        ok: false,
        status: 400,
        error: 'message_mismatch',
        message:
          'Signed message must state approval intent and contain the contract SHA-256 hash, e.g. "I approve Ambr contract <id> with hash <sha256>".',
      };
    }

    let recovered: string;
    try {
      recovered = verifyMessage(message, signature).toLowerCase();
    } catch {
      return {
        ok: false,
        status: 401,
        error: 'invalid_signature',
        message: 'Failed to verify wallet signature',
      };
    }

    if (recovered !== lc(walletAddress)) {
      return {
        ok: false,
        status: 401,
        error: 'signature_mismatch',
        message: 'Signature does not match wallet address',
      };
    }

    // Explicit before the entitlement check so the refusal names the real reason.
    if (recovered === lc(identity.agentWallet)) {
      return {
        ok: false,
        status: 403,
        error: 'agent_cannot_approve',
        message:
          'This wallet is the agent named in the contract. Article 14 approval must come from the principal, not the delegated agent.',
      };
    }

    if (!entitledApprovers(identity).has(recovered)) {
      return {
        ok: false,
        status: 403,
        error: 'wallet_not_entitled',
        message:
          'Wallet is not the principal for this contract. Bind it to the account (Account settings) or approve with the principal wallet.',
      };
    }

    return { ok: true, actor: `wallet:${recovered}`, assurance: 'wallet' };
  }

  // API key: retained only for accounts that cannot sign yet.
  if (attempt.caller) {
    // Fail closed on a missing owner. contracts.api_key_id is nullable, and a
    // null there means there is no owner to match — which must refuse the key
    // path, not skip the check and admit every key holder.
    if (!attempt.contractApiKeyId || attempt.caller.keyId !== attempt.contractApiKeyId) {
      return {
        ok: false,
        status: 403,
        error: 'not_contract_owner',
        message: 'This API key did not create the contract',
      };
    }

    if (accountCanSign(identity)) {
      return {
        ok: false,
        status: 403,
        error: 'wallet_signature_required',
        message:
          'This account has a bound wallet, so approval requires a wallet signature naming the contract hash. An API key alone cannot demonstrate human approval.',
      };
    }

    return {
      ok: true,
      actor: `api_key:${attempt.caller.email}:unbound`,
      assurance: 'weak_api_key',
    };
  }

  return {
    ok: false,
    status: 401,
    error: 'unauthorized',
    message:
      'Approval requires a wallet signature (wallet_address + signature + message) from the principal, or an API key for an account with no bound wallet.',
  };
}
