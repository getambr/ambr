import { describe, it, expect } from 'vitest';
import { Wallet } from 'ethers';
import {
  accountCanSign,
  bindsToApproval,
  entitledApprovers,
  resolveApprovalCredential,
  type ApprovalIdentity,
} from '@/lib/approval-auth';

// Real ECDSA throughout. ethers is a direct dependency, so genuine signatures
// cost nothing and the tests exercise the same code path production does.
const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const approvalMessage = (hash: string) => `I approve Ambr contract amb-test with hash ${hash}`;

const principal = Wallet.createRandom();
const agent = Wallet.createRandom();
const stranger = Wallet.createRandom();

const identity = (over: Partial<ApprovalIdentity> = {}): ApprovalIdentity => ({
  accountWallets: [principal.address.toLowerCase()],
  contractPrincipalWallet: principal.address.toLowerCase(),
  agentWallet: agent.address.toLowerCase(),
  callerDelegatedWallet: null,
  ...over,
});

// Wallet.createRandom() returns HDNodeWallet, so type this structurally rather
// than against the Wallet class.
type Signer = { address: string; signMessage: (m: string) => Promise<string> };

const signedBy = async (w: Signer, message: string) => ({
  walletAddress: w.address,
  signature: await w.signMessage(message),
  message,
});

const attempt = (over: Record<string, unknown> = {}) => ({
  contractHash: HASH,
  contractApiKeyId: 'key-1',
  caller: null,
  signed: null,
  ...over,
}) as Parameters<typeof resolveApprovalCredential>[0];

describe('bindsToApproval', () => {
  it('requires the contract hash — otherwise one signature approves every contract', () => {
    expect(bindsToApproval(approvalMessage(OTHER_HASH), HASH)).toBe(false);
    expect(bindsToApproval(approvalMessage(HASH), HASH)).toBe(true);
  });

  it('requires approval intent — a wallet-connect login signature is not an approval', () => {
    expect(bindsToApproval(`Sign in to Ambr. Contract ${HASH}`, HASH)).toBe(false);
    expect(bindsToApproval(`I am signing Ambr contract with hash ${HASH}`, HASH)).toBe(false);
  });
});

describe('entitledApprovers', () => {
  it('never admits the agent, even when it is recorded as principal_wallet', () => {
    // contract-engine falls back to principal_declaration.agent_id, so this is
    // the shape of every contract created without an explicit principal wallet.
    const set = entitledApprovers(
      identity({
        accountWallets: [],
        contractPrincipalWallet: agent.address.toLowerCase(),
      }),
    );
    expect(set.has(agent.address.toLowerCase())).toBe(false);
    expect(set.size).toBe(0);
  });

  it('admits bound account wallets and a verified delegation', () => {
    const set = entitledApprovers(
      identity({ callerDelegatedWallet: stranger.address.toLowerCase() }),
    );
    expect(set.has(principal.address.toLowerCase())).toBe(true);
    expect(set.has(stranger.address.toLowerCase())).toBe(true);
  });
});

describe('accountCanSign', () => {
  it('is false when the only bound wallet is the agent', () => {
    expect(accountCanSign(identity({ accountWallets: [agent.address.toLowerCase()] }))).toBe(false);
  });

  it('is false when nothing is bound', () => {
    expect(accountCanSign(identity({ accountWallets: [] }))).toBe(false);
  });
});

describe('resolveApprovalCredential — the exploit that was live', () => {
  it('refuses a freshly generated wallet signing a well-formed approval', async () => {
    // This is the actual hole: any wallet on Earth, no API key required.
    const rogue = Wallet.createRandom();
    const res = resolveApprovalCredential(
      attempt({ signed: await signedBy(rogue, approvalMessage(HASH)) }),
      identity(),
    );
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.status).toBe(403);
    expect(res.ok === false && res.error).toBe('wallet_not_entitled');
  });

  it('refuses a caller presenting no credential at all', () => {
    const res = resolveApprovalCredential(attempt(), identity());
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.status).toBe(401);
  });
});

describe('resolveApprovalCredential — replay', () => {
  it('refuses a signature harvested from a different contract', async () => {
    const res = resolveApprovalCredential(
      attempt({ signed: await signedBy(principal, approvalMessage(OTHER_HASH)) }),
      identity(),
    );
    expect(res.ok === false && res.error).toBe('message_mismatch');
  });

  it('refuses a login signature from the genuine principal', async () => {
    const res = resolveApprovalCredential(
      attempt({ signed: await signedBy(principal, `Sign in to Ambr\nHash: ${HASH}`) }),
      identity(),
    );
    expect(res.ok === false && res.error).toBe('message_mismatch');
  });

  it('refuses a signature that does not match the claimed address', async () => {
    const signed = await signedBy(principal, approvalMessage(HASH));
    const res = resolveApprovalCredential(
      attempt({ signed: { ...signed, walletAddress: stranger.address } }),
      identity(),
    );
    expect(res.ok === false && res.error).toBe('signature_mismatch');
  });
});

describe('resolveApprovalCredential — the agent may not approve its own work', () => {
  it('refuses the agent wallet even when principal_wallet holds that same address', async () => {
    const res = resolveApprovalCredential(
      attempt({ signed: await signedBy(agent, approvalMessage(HASH)) }),
      identity({
        accountWallets: [],
        contractPrincipalWallet: agent.address.toLowerCase(),
      }),
    );
    expect(res.ok === false && res.error).toBe('agent_cannot_approve');
  });
});

describe('resolveApprovalCredential — the happy path', () => {
  it('accepts the principal signing a bound approval', async () => {
    const res = resolveApprovalCredential(
      attempt({ signed: await signedBy(principal, approvalMessage(HASH)) }),
      identity(),
    );
    expect(res.ok).toBe(true);
    expect(res.ok === true && res.assurance).toBe('wallet');
    expect(res.ok === true && res.actor).toBe(`wallet:${principal.address.toLowerCase()}`);
  });
});

describe('resolveApprovalCredential — the graceful cutover', () => {
  const caller = { keyId: 'key-1', email: 'someone@example.com' };

  it('refuses the API key once the account has a wallet it could sign with', () => {
    const res = resolveApprovalCredential(attempt({ caller }), identity());
    expect(res.ok === false && res.error).toBe('wallet_signature_required');
    expect(res.ok === false && res.status).toBe(403);
  });

  it('still allows a wallet-less account, and marks the assurance as weak', () => {
    const res = resolveApprovalCredential(
      attempt({ caller }),
      identity({ accountWallets: [], contractPrincipalWallet: null }),
    );
    expect(res.ok).toBe(true);
    expect(res.ok === true && res.assurance).toBe('weak_api_key');
    // The actor string carries the caveat so the audit trail cannot overstate it.
    expect(res.ok === true && res.actor).toContain(':unbound');
  });

  it('refuses the key path when the contract records no owner at all', () => {
    // api_key_id is nullable. A null owner means there is nothing to match, so
    // the check must refuse rather than be skipped.
    const res = resolveApprovalCredential(
      attempt({ caller, contractApiKeyId: null }),
      identity({ accountWallets: [] }),
    );
    expect(res.ok === false && res.error).toBe('not_contract_owner');
  });

  it("refuses another account's API key outright", () => {
    const res = resolveApprovalCredential(
      attempt({ caller: { keyId: 'key-2', email: 'other@example.com' } }),
      identity({ accountWallets: [] }),
    );
    expect(res.ok === false && res.error).toBe('not_contract_owner');
  });
});
