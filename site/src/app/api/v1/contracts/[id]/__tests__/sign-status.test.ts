import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Wallet } from 'ethers';

// Wallet.createRandom() returns HDNodeWallet, so type signers structurally.
type Signer = { address: string; signMessage: (m: string) => Promise<string> };
import { createHash } from 'crypto';
import { hashContract } from '@/lib/contract-engine';

// In-memory Supabase stand-in: just enough of the query builder for the sign
// and status routes (select / eq / not / order / single / insert / update).
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
// Test hooks: fail the next signatures insert (e.g. the unique index firing),
// and run code just before an update lands (a concurrent request winning).
let signatureInsertError: { code: string; message: string } | null = null;
let beforeUpdate: (() => void) | null = null;
// Test hook: every read of this table fails (the database being down).
let failTable: string | null = null;

// The status rule of enforce_status_transition() plus
// enforce_awaiting_approval_transition(), written out independently of the app
// code so a route that asks for a jump the database refuses fails here too.
function transitionError(from: string, to: string, oneSided: boolean): string | null {
  if (from === to) return null;
  if (from === 'awaiting_principal_approval' && !['draft', 'revoked', 'expired', 'terminated'].includes(to)) {
    return `invalid status transition: awaiting_principal_approval -> ${to}`;
  }
  if (from === 'draft' && !['handshake', 'pending_signature', 'active'].includes(to)) {
    return `Invalid transition from draft to ${to}`;
  }
  if ((from === 'draft' || from === 'handshake') && to === 'active' && !oneSided) {
    return 'Bilateral contracts must transition through pending_signature before active';
  }
  if (from === 'handshake' && !['draft', 'pending_signature', 'active', 'revoked'].includes(to)) {
    return `Invalid transition from handshake to ${to}`;
  }
  if (from === 'pending_signature' && !['active', 'revoked', 'expired'].includes(to)) {
    return `Invalid transition from pending_signature to ${to}`;
  }
  if (['fulfilled', 'terminated', 'amended', 'revoked', 'expired'].includes(from)) {
    return `Cannot transition from terminal status: ${from}`;
  }
  return null;
}

class Query {
  private filters: Array<[string, unknown]> = [];
  private inFilters: Array<[string, unknown[]]> = [];
  private op: 'select' | 'insert' | 'update' = 'select';
  private patch: Row = {};
  private returning = false;
  private error: unknown = null;
  constructor(private table: string) {}
  select() { if (this.op === 'update') this.returning = true; return this; }
  not() { return this; }
  order() { return this; }
  eq(col: string, val: unknown) { this.filters.push([col, val]); return this; }
  in(col: string, vals: unknown[]) { this.inFilters.push([col, vals]); return this; }
  insert(row: Row | Row[]) {
    this.op = 'insert';
    if (this.table === 'signatures' && signatureInsertError) {
      this.error = signatureInsertError;
      return this;
    }
    // signatures_contract_slot_uniq: one row per slot per contract, where slot is set.
    const incoming = Array.isArray(row) ? row : [row];
    if (this.table === 'signatures') {
      const taken = incoming.find(
        (n) => n.slot != null && (tables.signatures ?? []).some((r) => r.contract_id === n.contract_id && r.slot === n.slot),
      );
      if (taken) {
        this.error = {
          code: '23505',
          message: 'duplicate key value violates unique constraint "signatures_contract_slot_uniq"',
        };
        return this;
      }
    }
    (tables[this.table] ??= []).push(...incoming);
    return this;
  }
  update(patch: Row) { this.op = 'update'; this.patch = patch; return this; }
  private rows() {
    return (tables[this.table] ?? []).filter(
      (r) => this.filters.every(([c, v]) => r[c] === v) && this.inFilters.every(([c, vs]) => vs.includes(r[c])),
    );
  }
  single() {
    if (this.table === failTable) return Promise.resolve({ data: null, error: { message: 'down' } });
    const rows = this.rows();
    return Promise.resolve(
      rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: 'no single row' } },
    );
  }
  then(resolve: (v: { data: Row[] | null; error: unknown }) => unknown) {
    if (this.table === failTable) return Promise.resolve({ data: null, error: { message: 'down' } }).then(resolve);
    let updated: Row[] = [];
    if (this.op === 'update') {
      beforeUpdate?.();
      updated = this.rows();
      if (this.table === 'contracts' && typeof this.patch.status === 'string') {
        for (const r of updated) {
          const msg = transitionError(String(r.status), this.patch.status, Boolean(r.is_one_sided));
          if (msg) return Promise.resolve({ data: null, error: { message: msg } }).then(resolve);
        }
      }
      for (const r of updated) Object.assign(r, this.patch);
    }
    const data = this.op === 'select' ? this.rows() : this.op === 'update' && this.returning ? updated : null;
    return Promise.resolve({ data, error: this.error }).then(resolve);
  }
}

const mintContractNFTAsync = vi.fn(async (..._a: unknown[]) => undefined);

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => new Query(t) }) }));
vi.mock('@/lib/chain/cnft-mint', () => ({ mintContractNFTAsync: (...a: unknown[]) => mintContractNFTAsync(...a) }));
vi.mock('@/lib/chain/cnft-metadata', () => ({ getMetadataUri: () => 'https://example.test/meta' }));
vi.mock('@/lib/email/notify-contract', () => ({ notifyContract: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));
vi.mock('@/lib/api-auth', () => ({ validateApiKey: vi.fn().mockResolvedValue(null) }));

import { validateApiKey } from '@/lib/api-auth';
import { notifyContract } from '@/lib/email/notify-contract';
import { handleMcpMessage } from '@/lib/mcp/server';
import { POST as sign } from '../sign/route';
import { GET as getStatus } from '../status/route';

const requester = Wallet.createRandom();
const executor = Wallet.createRandom();
const stranger = Wallet.createRandom();
const lc = (w: { address: string }) => w.address.toLowerCase();

const HUMAN = 'The parties agree.';
const MACHINE = { kind: 'test' };
const HASH = hashContract(HUMAN, MACHINE);
const CID = 'amb-2026-9001';

function seed(over: Row = {}) {
  tables.contracts = [
    {
      id: 'row-1', contract_id: CID, status: 'draft', sha256_hash: HASH, visibility: 'public',
      require_zk_identity: false, api_key_id: null, payer_wallet: null, counterparty_email: null,
      is_one_sided: false, principal_wallet: lc(requester),
      human_readable: HUMAN, machine_readable: MACHINE, revoked_at: null, expiry_date: null,
      parameters: { requester_agent_id: requester.address, executor_agent_id: executor.address },
      ...over,
    },
  ];
  tables.signatures = [];
  tables.amendment_proposals = [];
  signatureInsertError = null;
  beforeUpdate = null;
  tables.handshakes = [];
  tables.audit_log = [];
  tables.api_keys = [];
  tables.identity_nullifiers = [];
  tables.share_tokens = [];
  tables.account_wallets = [];
  failTable = null;
}

// Two API keys the validateApiKey stand-in knows, read from the same headers
// as the real one. 'creator-key' is the key the open-slot tests create with.
const KEYS: Record<string, string> = { 'creator-key': 'key-1', 'other-key': 'key-2' };

async function signAs(w: Signer, opts: { headers?: Record<string, string>; shareToken?: string } = {}) {
  const message = `I sign ${HASH}`;
  const req = new Request(`https://x.test/api/v1/contracts/${CID}/sign`, {
    method: 'POST',
    headers: opts.headers,
    body: JSON.stringify({
      wallet_address: w.address,
      signature: await w.signMessage(message),
      message,
      ...(opts.shareToken ? { share_token: opts.shareToken } : {}),
    }),
  });
  const res = await sign(req, { params: Promise.resolve({ id: CID }) });
  return { status: res.status, body: await res.json() };
}

async function statusBody() {
  const res = await getStatus(new Request(`https://x.test/api/v1/contracts/${CID}/status`), {
    params: Promise.resolve({ id: CID }),
  });
  return res.json();
}

const status = () => tables.contracts[0].status;

beforeEach(() => {
  mintContractNFTAsync.mockClear();
  vi.mocked(validateApiKey).mockReset();
  vi.mocked(validateApiKey).mockImplementation(async (req: Request) => {
    const k = req.headers.get('X-API-Key') || req.headers.get('Authorization')?.replace('Bearer ', '');
    return k && KEYS[k]
      ? { keyId: KEYS[k], email: 'k@x.test', credits: 1, tier: 'free', principalWallet: null, delegationScope: null, agentDailyLimit: 10, betaFeatures: {} }
      : null;
  });
  seed();
});

describe('sign route: party gate', () => {
  it('a wrong wallet cannot sign a c3 contract as either party', async () => {
    const first = await signAs(stranger);
    expect(first.status).toBe(403);
    expect(first.body.error).toBe('unauthorized_party');

    expect((await signAs(requester)).status).toBe(200);
    const second = await signAs(stranger);
    expect(second.status).toBe(403);
    expect(second.body.error).toBe('unauthorized_counterparty');

    expect(status()).toBe('pending_signature');
    expect(tables.signatures).toHaveLength(1);
    expect(mintContractNFTAsync).not.toHaveBeenCalled();
  });

  it('the requester and executor together activate a c3 contract', async () => {
    expect((await signAs(requester)).body.status).toBe('pending_signature');
    const done = await signAs(executor);
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('active');
    expect(status()).toBe('active');
    expect(mintContractNFTAsync).toHaveBeenCalledTimes(1);
  });

  it('the activation email links the counterparty to a read-only token, not an invite', async () => {
    seed({ counterparty_email: 'other@x.test' });
    vi.mocked(notifyContract).mockClear();
    await signAs(requester);
    expect((await signAs(executor)).body.status).toBe('active');
    const call = vi.mocked(notifyContract).mock.calls.find(([a]) => a.recipientRole === 'counterparty');
    const url = String((call?.[0] as { readerUrl?: string } | undefined)?.readerUrl);
    const token = new URL(url).searchParams.get('token');
    expect(token).toBeTruthy();
    const row = tables.share_tokens.find(t => t.token === token);
    expect(row).toMatchObject({ contract_id: 'row-1', purpose: 'deployer' });
    expect(row?.expires_at).toBeTruthy();
  });

  it('the executor may sign first; the requester then completes it', async () => {
    expect((await signAs(executor)).status).toBe(200);
    expect((await signAs(requester)).body.status).toBe('active');
  });

  it('the same wallet cannot sign twice', async () => {
    await signAs(requester);
    const again = await signAs(requester);
    expect(again.status).toBe(409);
    expect(status()).toBe('pending_signature');
  });

  it('a unique-index violation (two racing requests) is 409 already_signed', async () => {
    signatureInsertError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const res = await signAs(requester);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_signed');
    expect(status()).toBe('draft');
  });

  it('an open counterparty slot can be taken by a wallet that brings the invite token', async () => {
    seed({ status: 'pending_signature', parameters: { requester_agent_id: requester.address } });
    tables.signatures.push({ contract_id: 'row-1', signer_wallet: lc(requester) });
    tables.share_tokens.push({ contract_id: 'row-1', token: 'invite', access_level: 'full', purpose: 'invite', expires_at: null });
    const res = await signAs(stranger, { shareToken: 'invite' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });

  it('the counterparty refusal message fits both a declared and an open slot', async () => {
    seed({ status: 'pending_signature' });
    tables.signatures.push({ contract_id: 'row-1', signer_wallet: lc(requester) });
    const res = await signAs(stranger);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('unauthorized_counterparty');
    expect(res.body.message).not.toMatch(/deployed for a specific/);
  });

  it('party fields of another template (C2 client / provider) are enforced too', async () => {
    seed({ parameters: { client_agent_id: requester.address, provider_agent_id: executor.address } });
    expect((await signAs(stranger)).status).toBe(403);
    await signAs(requester);
    expect((await signAs(stranger)).status).toBe(403);
    expect((await signAs(executor)).body.status).toBe('active');
  });

  it('one-sided: a stranger is refused and nothing is stored; the principal activates alone', async () => {
    seed({ is_one_sided: true, parameters: { principal_agent_id: requester.address, agent_id: executor.address } });
    const bad = await signAs(stranger);
    expect(bad.status).toBe(403);
    expect(bad.body.error).toBe('not_principal');
    expect(tables.signatures).toHaveLength(0);

    expect((await signAs(executor)).status).toBe(403);

    const ok = await signAs(requester);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('active');
    expect(tables.signatures).toHaveLength(1);
  });
});

describe('sign route: signature level', () => {
  it('records a bare wallet signature as simple', async () => {
    await signAs(requester);
    expect(tables.signatures[0].signature_level).toBe('simple');
  });
});

describe('status route: is_currently_valid', () => {
  const sigRow = (w: Signer) => ({
    contract_id: 'row-1', signer_wallet: lc(w), signed_at: '2026-10-26T00:00:00Z', signature_level: 'simple',
  });

  it('is not valid while an active contract is missing signatures', async () => {
    seed({ status: 'active' });
    let body = await statusBody();
    expect(body.is_currently_valid).toBe(false);
    expect(body.validity_reasons).toEqual(['missing_signatures']);
    expect(body.missing_signers).toEqual(['principal', 'counterparty']);

    tables.signatures.push(sigRow(requester));
    body = await statusBody();
    expect(body.is_currently_valid).toBe(false);
    expect(body.missing_signers).toEqual(['counterparty']);
  });

  it('a signature from a non-party does not complete the contract', async () => {
    seed({ status: 'active' });
    tables.signatures.push(sigRow(requester), sigRow(stranger));
    expect((await statusBody()).is_currently_valid).toBe(false);
  });

  it('is valid once every required signature is on file', async () => {
    seed({ status: 'active' });
    tables.signatures.push(sigRow(requester), sigRow(executor));
    const body = await statusBody();
    expect(body.is_currently_valid).toBe(true);
    expect(body.validity_reasons).toEqual([]);
    expect(body.missing_signers).toBeUndefined();
  });

  it('one-sided contract is valid with the principal signature alone', async () => {
    seed({ status: 'active', is_one_sided: true });
    tables.signatures.push(sigRow(requester));
    expect((await statusBody()).is_currently_valid).toBe(true);
  });

  it('keeps the old reasons: not active, revoked, expired', async () => {
    seed({ status: 'pending_signature', revoked_at: '2026-10-01T00:00:00Z', expiry_date: '2020-01-01' });
    tables.signatures.push(sigRow(requester), sigRow(executor));
    const body = await statusBody();
    expect(body.is_currently_valid).toBe(false);
    expect(body.validity_reasons).toEqual(['status_pending_signature', 'revoked', 'expired']);
  });

  it('is not valid when the stored text no longer matches the creation hash', async () => {
    seed({ status: 'active', human_readable: HUMAN + ' (edited)' });
    tables.signatures.push(sigRow(requester), sigRow(executor));
    const body = await statusBody();
    expect(body.is_currently_valid).toBe(false);
    expect(body.validity_reasons).toEqual(['hash_mismatch']);
  });
});

describe('sign route: status follows the signatures on file', () => {
  const sigRow = (w: Signer) => ({
    contract_id: 'row-1', signer_wallet: lc(w), signed_at: '2026-10-26T00:00:00Z', signature_level: 'simple',
  });

  it('a draft whose other signature is already on file reaches active through pending_signature', async () => {
    tables.signatures.push(sigRow(executor));
    const res = await signAs(requester);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(status()).toBe('active');
    expect(mintContractNFTAsync).toHaveBeenCalledTimes(1);
  });

  it('a pending contract stays pending when the signature leaves a slot empty', async () => {
    seed({ status: 'pending_signature' });
    const res = await signAs(requester);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_signature');
    expect(status()).toBe('pending_signature');
    expect(mintContractNFTAsync).not.toHaveBeenCalled();
  });

  it('refuses to sign while awaiting principal approval, and stores nothing', async () => {
    seed({ status: 'awaiting_principal_approval' });
    const res = await signAs(requester);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('awaiting_principal_approval');
    expect(status()).toBe('awaiting_principal_approval');
    expect(tables.signatures).toHaveLength(0);
    expect(mintContractNFTAsync).not.toHaveBeenCalled();
  });

  it('(i) after the principal approves (draft), both parties can sign and it activates', async () => {
    seed({ status: 'awaiting_principal_approval' });
    expect((await signAs(requester)).status).toBe(409);
    tables.contracts[0].status = 'draft'; // principal approval moves it to draft
    expect((await signAs(requester)).body.status).toBe('pending_signature');
    const done = await signAs(executor);
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('active');
    expect(status()).toBe('active');
    expect(mintContractNFTAsync).toHaveBeenCalledTimes(1);
  });

  it('(ii) two parties signing a draft at the same time both succeed; one mint', async () => {
    const [a, b] = await Promise.all([signAs(requester), signAs(executor)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(status()).toBe('active');
    expect(tables.signatures).toHaveLength(2);
    expect(mintContractNFTAsync).toHaveBeenCalledTimes(1);
  });

  it('(iii) when the other request moved draft to pending first, this one re-reads and activates', async () => {
    tables.signatures.push(sigRow(requester));
    beforeUpdate = () => {
      beforeUpdate = null;
      tables.contracts[0].status = 'pending_signature'; // the other party's request won the first step
    };
    const res = await signAs(executor);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(status()).toBe('active');
    expect(mintContractNFTAsync).toHaveBeenCalledTimes(1);
  });

  it('a one-sided contract with no principal_wallet is signed by the principal_agent_id wallet', async () => {
    seed({ is_one_sided: true, principal_wallet: null, parameters: { principal_agent_id: requester.address, agent_id: executor.address } });
    expect((await signAs(stranger)).status).toBe(403);
    const ok = await signAs(requester);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('active');
  });

  it('when a concurrent request already activated it, this one neither re-transitions nor mints', async () => {
    seed({ status: 'pending_signature' });
    tables.signatures.push(sigRow(requester));
    beforeUpdate = () => { tables.contracts[0].status = 'active'; };
    const res = await signAs(executor);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(mintContractNFTAsync).not.toHaveBeenCalled();
  });
});

describe('same wallet on both sides (legacy rows)', () => {
  it('a principal_wallet copied from the counterparty is ignored: the real deployer can sign', async () => {
    // amb-2026-0025..0027: principal_wallet == the counterparty's wallet.
    seed({
      principal_wallet: lc(executor),
      parameters: { principal_agent_id: requester.address, agent_id: executor.address },
    });
    expect((await signAs(requester)).status).toBe(200);
    expect((await signAs(executor)).body.status).toBe('active');
  });
});

describe('status route: hash schemes', () => {
  it('accepts a hash made with the old top-level key sort', async () => {
    const machine = { b: { z: 1, a: 2 }, a: 1 };
    const legacy = createHash('sha256')
      .update(HUMAN + '\n---\n' + JSON.stringify({ a: 1, b: { z: 1, a: 2 } }), 'utf-8')
      .digest('hex');
    expect(legacy).not.toBe(hashContract(HUMAN, machine));
    seed({ status: 'active', machine_readable: machine, sha256_hash: legacy });
    tables.signatures.push(
      { contract_id: 'row-1', signer_wallet: lc(requester), signed_at: 'x', signature_level: 'simple' },
      { contract_id: 'row-1', signer_wallet: lc(executor), signed_at: 'x', signature_level: 'simple' },
    );
    const body = await statusBody();
    expect(body.validity_reasons).toEqual([]);
    expect(body.is_currently_valid).toBe(true);
  });
});

describe('amendment contracts: signers come from the proposal', () => {
  const holderA = Wallet.createRandom();
  const holderB = Wallet.createRandom();
  const sig = (w: { address: string }) => ({
    contract_id: 'row-1', signer_wallet: lc(w), signed_at: 'x', signature_level: 'simple',
  });

  function seedAmendment(approvedBy: string | null = lc(holderB)) {
    seed({ status: 'active', amendment_type: 'amendment' });
    tables.amendment_proposals = [
      { id: 'p-1', original_contract_id: 'row-0', resulting_contract_id: 'row-1', proposer_wallet: lc(holderA), approved_by_wallet: approvedBy },
    ];
  }

  it('is valid with the proposer and approver signatures, though they are not the wallets in the parameters', async () => {
    seedAmendment();
    tables.signatures.push(sig(holderA), sig(holderB));
    expect((await statusBody()).is_currently_valid).toBe(true);
  });

  it('is not valid with only the parameter wallets signed', async () => {
    seedAmendment();
    tables.signatures.push(sig(requester), sig(executor));
    const body = await statusBody();
    expect(body.is_currently_valid).toBe(false);
    expect(body.validity_reasons).toEqual(['missing_signatures']);
  });

  it('proposer and approver being one wallet needs one signature', async () => {
    seedAmendment(lc(holderA));
    tables.signatures.push(sig(holderA));
    expect((await statusBody()).is_currently_valid).toBe(true);
  });
});

describe('MCP ambr_get_contract_status matches /status', () => {
  const sig = (w: { address: string }) => ({
    contract_id: 'row-1', signer_wallet: lc(w), signed_at: 'x', signature_level: 'simple',
  });

  async function mcpText(name: string, args: Record<string, unknown>) {
    const res = await handleMcpMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
      undefined,
    );
    return (res?.result as { content: { text: string }[] }).content[0].text;
  }

  it('says not valid while a signature is missing, and valid once complete', async () => {
    seed({ status: 'active' });
    tables.signatures.push(sig(requester));
    expect((await statusBody()).is_currently_valid).toBe(false);
    let text = await mcpText('ambr_get_contract_status', { id: CID });
    expect(text).toContain('Currently valid:** no');
    expect(text).toContain('missing_signatures');
    expect(text).toContain('counterparty');

    tables.signatures.push(sig(executor));
    expect((await statusBody()).is_currently_valid).toBe(true);
    text = await mcpText('ambr_get_contract_status', { id: CID });
    expect(text).toContain('Currently valid:** yes');
  });

  it('says not valid on a hash mismatch, like /status', async () => {
    seed({ status: 'active', human_readable: HUMAN + ' (edited)' });
    tables.signatures.push(sig(requester), sig(executor));
    expect((await statusBody()).is_currently_valid).toBe(false);
    expect(await mcpText('ambr_get_contract_status', { id: CID })).toContain('Currently valid:** no');
  });

  it('ambr_verify_hash reports a mismatch when the stored text changed', async () => {
    seed({ status: 'active', human_readable: HUMAN + ' (edited)' });
    expect(await mcpText('ambr_verify_hash', { hash: HASH })).toContain('MISMATCH');
  });
});

describe('sign route: an open slot needs the creator (principal) or an invite (counterparty)', () => {
  const asCreator = { headers: { 'X-API-Key': 'creator-key' } };
  const token = (over: Row = {}) => ({
    contract_id: 'row-1', token: 'invite', access_level: 'full', purpose: 'invite', expires_at: null, ...over,
  });
  const sigRow = (w: Signer) => ({ contract_id: 'row-1', signer_wallet: lc(w), signed_at: 'x', signature_level: 'simple' });

  // The dashboard builder's shape: created with a key, no principal wallet, the executor named.
  const seedOpenPrincipal = (over: Row = {}) =>
    seed({ api_key_id: 'key-1', principal_wallet: null, parameters: { executor_agent_id: executor.address }, ...over });

  describe('open principal slot, account with no bound wallet: the creating key', () => {
    it('refuses a stranger without a key, and stores nothing', async () => {
      seedOpenPrincipal();
      const res = await signAs(stranger);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('principal_slot_restricted');
      expect(tables.signatures).toHaveLength(0);
      expect(status()).toBe('draft');
    });

    it('allows the creator key, as X-API-Key and as a Bearer token', async () => {
      seedOpenPrincipal();
      const first = await signAs(requester, asCreator);
      expect(first.status).toBe(200);
      expect(first.body.status).toBe('pending_signature');

      seedOpenPrincipal();
      expect((await signAs(requester, { headers: { Authorization: 'Bearer creator-key' } })).status).toBe(200);
    });

    it('refuses a different valid key, an unknown key, and the creator key of another contract', async () => {
      seedOpenPrincipal();
      for (const headers of [{ 'X-API-Key': 'other-key' }, { 'X-API-Key': 'nobody' }]) {
        const res = await signAs(stranger, { headers });
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('principal_slot_restricted');
      }
      seedOpenPrincipal({ api_key_id: 'key-2' });
      expect((await signAs(stranger, asCreator)).body.error).toBe('principal_slot_restricted');
      expect(tables.signatures).toHaveLength(0);
    });

    it('bindings of another account do not count', async () => {
      seedOpenPrincipal();
      tables.account_wallets.push({ api_key_id: 'key-2', wallet_address: lc(stranger), source: 'manual' });
      expect((await signAs(requester, asCreator)).status).toBe(200);
    });
  });

  describe('open principal slot, account with a bound wallet: only that wallet', () => {
    it('refuses the creating key with a different wallet, and accepts the bound wallet', async () => {
      seedOpenPrincipal();
      tables.account_wallets.push({ api_key_id: 'key-1', wallet_address: lc(requester), source: 'manual' });
      const refused = await signAs(stranger, asCreator);
      expect(refused.status).toBe(403);
      expect(refused.body.error).toBe('principal_slot_restricted');
      expect(refused.body.message).toMatch(/verified wallet/);
      expect(tables.signatures).toHaveLength(0);

      expect((await signAs(requester)).status).toBe(200); // the wallet needs no key
      expect(tables.signatures).toHaveLength(1);
    });

    it('the bound wallet works with the key too', async () => {
      seedOpenPrincipal();
      tables.account_wallets.push({ api_key_id: 'key-1', wallet_address: lc(requester), source: 'manual' });
      expect((await signAs(requester, asCreator)).status).toBe(200);
    });

    it('a delegated wallet (api_keys.principal_wallet) counts as bound', async () => {
      seedOpenPrincipal();
      tables.api_keys.push({ id: 'key-1', principal_wallet: lc(requester) });
      expect((await signAs(stranger, asCreator)).body.error).toBe('principal_slot_restricted');
      expect((await signAs(requester)).status).toBe(200);
    });

    it('the agent named in principal_declaration is not a bound wallet: the key path stays', async () => {
      seedOpenPrincipal({ principal_declaration: { agent_id: stranger.address } });
      tables.account_wallets.push({ api_key_id: 'key-1', wallet_address: lc(stranger), source: 'manual' });
      expect((await signAs(stranger)).body.error).toBe('principal_slot_restricted'); // the agent alone
      expect((await signAs(requester, asCreator)).status).toBe(200);
    });
  });

  describe('open principal slot, x402 contract', () => {
    it('the payer wallet may sign, a stranger and any key may not', async () => {
      seedOpenPrincipal({ api_key_id: null, payer_wallet: lc(requester) });
      expect((await signAs(stranger)).body.error).toBe('principal_slot_restricted');
      expect((await signAs(stranger, asCreator)).body.error).toBe('principal_slot_restricted');
      const ok = await signAs(requester);
      expect(ok.status).toBe(200);
      expect(ok.body.status).toBe('pending_signature');
    });

    it('the payer wallet counts only when the contract has no key', async () => {
      seedOpenPrincipal({ api_key_id: 'key-1', payer_wallet: lc(requester) });
      expect((await signAs(requester)).body.error).toBe('principal_slot_restricted');
    });

    it('an invite token does not open the principal slot', async () => {
      seedOpenPrincipal();
      tables.share_tokens.push(token());
      expect((await signAs(stranger, { shareToken: 'invite' })).body.error).toBe('principal_slot_restricted');
    });
  });

  describe('declared wallets stay keyless', () => {
    it('sign without a key or token, and no key lookup happens', async () => {
      seed({ api_key_id: 'key-1' });
      expect((await signAs(requester)).status).toBe(200);
      expect((await signAs(executor)).body.status).toBe('active');
      expect(validateApiKey).not.toHaveBeenCalled();
    });

    it('a declared principal wallet signs keyless while the counterparty slot is open to invitees', async () => {
      seed({ api_key_id: 'key-1', parameters: { requester_agent_id: requester.address } });
      expect((await signAs(requester)).status).toBe(200);
      expect(validateApiKey).not.toHaveBeenCalled();
    });
  });

  describe('open counterparty slot', () => {
    function seedOpenCounterparty() {
      seed({ status: 'pending_signature', api_key_id: 'key-1', parameters: { requester_agent_id: requester.address } });
      tables.signatures.push(sigRow(requester));
    }

    it('refuses a wallet without a token and points at the invite link', async () => {
      seedOpenCounterparty();
      const res = await signAs(stranger);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('counterparty_invite_required');
      expect(res.body.message).toMatch(/invite link/);
      expect(tables.signatures).toHaveLength(1);
    });

    it('accepts a valid full token and activates', async () => {
      seedOpenCounterparty();
      tables.share_tokens.push(token());
      const res = await signAs(stranger, { shareToken: 'invite' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
      expect(mintContractNFTAsync).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['an expired token', token({ expires_at: new Date(Date.now() - 1000).toISOString() })],
      ['a token for another contract', token({ contract_id: 'row-2' })],
      ['a scope-only token', token({ access_level: 'scope' })],
    ])('refuses %s', async (_name, row) => {
      seedOpenCounterparty();
      tables.share_tokens.push(row);
      const res = await signAs(stranger, { shareToken: 'invite' });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('counterparty_invite_required');
      expect(status()).toBe('pending_signature');
    });

    it('refuses an unknown token', async () => {
      seedOpenCounterparty();
      tables.share_tokens.push(token());
      expect((await signAs(stranger, { shareToken: 'guess' })).body.error).toBe('counterparty_invite_required');
    });

    it('the creator key does not unlock the counterparty slot', async () => {
      seedOpenCounterparty();
      const res = await signAs(stranger, asCreator);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('counterparty_invite_required');
    });
  });

  describe('both slots open', () => {
    const seedBothOpen = () => seed({ api_key_id: 'key-1', principal_wallet: null, parameters: {} });

    it('a stranger with neither a key nor a token is refused', async () => {
      seedBothOpen();
      const res = await signAs(stranger);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('principal_slot_restricted');
      expect(tables.signatures).toHaveLength(0);
    });

    it('the creator takes the principal slot and an invitee the counterparty slot, in either order', async () => {
      seedBothOpen();
      tables.share_tokens.push(token());
      expect((await signAs(requester, asCreator)).body.status).toBe('pending_signature');
      expect((await signAs(executor, { shareToken: 'invite' })).body.status).toBe('active');

      seedBothOpen();
      tables.share_tokens.push(token());
      expect((await signAs(executor, { shareToken: 'invite' })).body.status).toBe('pending_signature');
      expect((await signAs(requester, asCreator)).body.status).toBe('active');
    });

    it('two invite holders cannot complete the contract without the creator', async () => {
      seedBothOpen();
      tables.share_tokens.push(token());
      expect((await signAs(executor, { shareToken: 'invite' })).status).toBe(200);
      const second = await signAs(stranger, { shareToken: 'invite' });
      expect(second.status).toBe(403);
      expect(second.body.error).toBe('principal_slot_restricted');
      expect(status()).toBe('pending_signature');
      expect(tables.signatures).toHaveLength(1);
      expect((await signAs(requester, asCreator)).body.status).toBe('active');
    });

    it('the creator key cannot fill both sides', async () => {
      seedBothOpen();
      expect((await signAs(requester, asCreator)).status).toBe(200);
      const second = await signAs(stranger, asCreator);
      expect(second.status).toBe(403);
      expect(second.body.error).toBe('counterparty_invite_required');
    });
  });

  describe('validity is untouched', () => {
    it('counts signatures already on file in open slots exactly as before', async () => {
      seed({ status: 'active', api_key_id: 'key-1', principal_wallet: null, parameters: {} });
      tables.signatures.push(sigRow(requester), sigRow(stranger));
      const body = await statusBody();
      expect(body.is_currently_valid).toBe(true);
      expect(body.validity_reasons).toEqual([]);
    });
  });
});

describe('sign route: slots are recorded and enforced by the database', () => {
  const asCreator = { headers: { 'X-API-Key': 'creator-key' } };
  const invite = (over: Row = {}) => ({
    contract_id: 'row-1', token: 'invite', access_level: 'full', purpose: 'invite', expires_at: null, ...over,
  });
  const seedBothOpen = () => {
    seed({ api_key_id: 'key-1', principal_wallet: null, parameters: {} });
    tables.share_tokens.push(invite());
  };

  it('writes the slot with every new signature, declared or open', async () => {
    seedBothOpen();
    await signAs(executor, { shareToken: 'invite' });
    await signAs(requester, asCreator);
    expect(tables.signatures.map((r) => r.slot).sort()).toEqual(['counterparty', 'principal']);

    seed();
    await signAs(requester);
    expect(tables.signatures[0].slot).toBe('principal');
  });

  it('two wallets of one invite holder, sent together: one lands, the other does not, nothing activates', async () => {
    seedBothOpen();
    const [a, b] = await Promise.all([
      signAs(executor, { shareToken: 'invite' }),
      signAs(stranger, { shareToken: 'invite' }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);
    const loser = a.status === 200 ? b : a;
    expect(['slot_taken', 'principal_slot_restricted']).toContain(loser.body.error);
    expect(tables.signatures).toHaveLength(1);
    expect(status()).toBe('pending_signature');
    expect(mintContractNFTAsync).not.toHaveBeenCalled();
  });

  it('a request that passed the gate while another took the slot gets 409 slot_taken', async () => {
    seedBothOpen();
    signatureInsertError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "signatures_contract_slot_uniq"',
    };
    const res = await signAs(executor, { shareToken: 'invite' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('slot_taken');
    expect(tables.signatures).toHaveLength(0);
  });

  it('a second invite holder sent after the first is refused by the gate', async () => {
    seedBothOpen();
    expect((await signAs(executor, { shareToken: 'invite' })).status).toBe(200);
    const second = await signAs(stranger, { shareToken: 'invite' });
    expect(second.status).toBe(403);
    expect(second.body.error).toBe('principal_slot_restricted');
    expect(status()).toBe('pending_signature');
  });

  it('rows from before slots were recorded still fill whichever side fits', async () => {
    seed({ status: 'pending_signature', api_key_id: 'key-1', principal_wallet: null, parameters: {} });
    tables.share_tokens.push(invite());
    tables.signatures.push({ contract_id: 'row-1', signer_wallet: lc(requester), signed_at: 'x', signature_level: 'simple' });
    const res = await signAs(executor, { shareToken: 'invite' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });
});

describe('sign route: which bindings prove the creator', () => {
  const asCreator = { headers: { 'X-API-Key': 'creator-key' } };
  const seedOpenPrincipal = () =>
    seed({ api_key_id: 'key-1', principal_wallet: null, parameters: { executor_agent_id: executor.address } });
  const bind = (w: Signer, source: string) =>
    tables.account_wallets.push({ api_key_id: 'key-1', wallet_address: lc(w), source });

  it('ignores backfilled and auto-deploy bindings: the owner key still works, and a former counterparty cannot sign as principal', async () => {
    seedOpenPrincipal();
    bind(stranger, 'auto_backfill'); // a counterparty who once signed under this key
    bind(executor, 'auto_deploy'); // a wallet someone typed at deploy time
    const refused = await signAs(stranger);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe('principal_slot_restricted');
    expect((await signAs(stranger, { headers: { 'X-API-Key': 'other-key' } })).status).toBe(403);
    expect(tables.signatures).toHaveLength(0);

    const owner = await signAs(requester, asCreator);
    expect(owner.status).toBe(200);
    expect(owner.body.status).toBe('pending_signature');
  });

  it.each(['manual', 'auto_wallet_auth'])('enforces a %s binding: the key with another wallet is refused, the bound wallet signs', async (source) => {
    seedOpenPrincipal();
    bind(requester, source);
    const refused = await signAs(stranger, asCreator);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe('principal_slot_restricted');
    expect((await signAs(requester)).status).toBe(200);
  });
});

describe('sign route: the deployer link is not an invite', () => {
  const asCreator = { headers: { 'X-API-Key': 'creator-key' } };
  const token = (over: Row = {}) => ({
    contract_id: 'row-1', token: 'invite', access_level: 'full', purpose: 'invite', expires_at: null, ...over,
  });
  function seedOpenCounterparty() {
    seed({ status: 'pending_signature', api_key_id: 'key-1', parameters: { requester_agent_id: requester.address } });
    tables.signatures.push({ contract_id: 'row-1', signer_wallet: lc(requester), signed_at: 'x', signature_level: 'simple' });
  }

  it('a deployer token cannot fill the counterparty slot, nor can one made before purposes existed', async () => {
    seedOpenCounterparty();
    tables.share_tokens.push(token({ purpose: 'deployer' }));
    const res = await signAs(stranger, { shareToken: 'invite' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('counterparty_invite_required');

    seedOpenCounterparty();
    const { purpose: _purpose, ...legacy } = token();
    tables.share_tokens.push(legacy);
    expect((await signAs(stranger, { shareToken: 'invite' })).status).toBe(403);
    expect(tables.signatures).toHaveLength(1);
  });

  it('an invite token can', async () => {
    seedOpenCounterparty();
    tables.share_tokens.push(token());
    const res = await signAs(stranger, { shareToken: 'invite' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });

  it('a request holding the creating key is never placed on the counterparty slot, even with an invite', async () => {
    seedOpenCounterparty();
    tables.share_tokens.push(token());
    const res = await signAs(stranger, { ...asCreator, shareToken: 'invite' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('principal_slot_restricted');
    expect(tables.signatures).toHaveLength(1);
    // The same invite without the creating key is fine.
    expect((await signAs(stranger, { shareToken: 'invite' })).status).toBe(200);
  });

  it('a declared counterparty is not touched by the creator rule', async () => {
    seed({ status: 'pending_signature', api_key_id: 'key-1', principal_wallet: lc(requester) });
    tables.signatures.push({ contract_id: 'row-1', signer_wallet: lc(requester), signed_at: 'x', signature_level: 'simple' });
    expect((await signAs(executor, asCreator)).status).toBe(200);
  });
});

describe('sign route: when the party check cannot run', () => {
  const asCreator = { headers: { 'X-API-Key': 'creator-key' } };
  const seedOpenPrincipal = () =>
    seed({ api_key_id: 'key-1', principal_wallet: null, parameters: { executor_agent_id: executor.address } });

  it('answers a JSON 503 party_check_unavailable and stores nothing', async () => {
    seedOpenPrincipal();
    failTable = 'account_wallets';
    const res = await signAs(requester, asCreator);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('party_check_unavailable');
    expect(tables.signatures).toHaveLength(0);
  });

  it('does not run for a declared counterparty, which signs as usual', async () => {
    seedOpenPrincipal();
    failTable = 'account_wallets';
    const res = await signAs(executor);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_signature');
  });

  it('does not run for a wallet that could not take the principal slot anyway', async () => {
    seed({ status: 'pending_signature', api_key_id: 'key-1', parameters: { requester_agent_id: requester.address } });
    tables.signatures.push({ contract_id: 'row-1', signer_wallet: lc(requester), signed_at: 'x', signature_level: 'simple' });
    failTable = 'account_wallets';
    const res = await signAs(stranger);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('counterparty_invite_required');
  });
});
