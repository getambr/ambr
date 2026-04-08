import { notFound } from 'next/navigation';
import { createHash } from 'crypto';
import { getSupabase } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import ContractViewer from './ContractViewer';
import ExportButtons from './ExportButtons';
import SignContract from '@/components/reader/SignContract';
import NftStatus from '@/components/reader/NftStatus';
import ReaderAuthGate from '@/components/reader/ReaderAuthGate';
import ZKIdentityBadge from '@/components/reader/ZKIdentityBadge';

interface Props {
  params: Promise<{ hashOrId: string }>;
  searchParams: Promise<{ token?: string }>;
}

async function getContract(hashOrId: string) {
  const db = getSupabase();

  let query = db.from('contracts').select('*');

  if (hashOrId.startsWith('amb-')) {
    query = query.eq('contract_id', hashOrId);
  } else if (/^[a-f0-9]{64}$/.test(hashOrId)) {
    query = query.eq('sha256_hash', hashOrId);
  } else {
    query = query.eq('id', hashOrId);
  }

  const { data } = await query.single();
  return data;
}

async function validateShareToken(contractUuid: string, token: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data } = await db
    .from('share_tokens')
    .select('id, expires_at')
    .eq('contract_id', contractUuid)
    .eq('token', token)
    .single();

  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
  return true;
}

function verifyHash(humanReadable: string, machineReadable: Record<string, unknown>, storedHash: string): boolean {
  const sortedKeys = Object.keys(machineReadable).sort();
  const sortedObj = Object.fromEntries(sortedKeys.map((k) => [k, machineReadable[k]]));
  const canonical = humanReadable + '\n---\n' + JSON.stringify(sortedObj);
  const computed = createHash('sha256').update(canonical, 'utf-8').digest('hex');
  return computed === storedHash;
}

export default async function ReaderPage({ params, searchParams }: Props) {
  const { hashOrId } = await params;
  const { token } = await searchParams;
  const contract = await getContract(hashOrId);

  if (!contract) {
    notFound();
  }

  // Check authorization: share token grants full access
  let authorized = false;
  if (token) {
    authorized = await validateShareToken(contract.id, token);
  }

  const isVerified = verifyHash(
    contract.human_readable,
    contract.machine_readable,
    contract.sha256_hash,
  );

  // Fetch existing signatures for display + signing gate
  const { data: signatures } = await getSupabaseAdmin()
    .from('signatures')
    .select('signer_wallet, signed_at, signer_identity')
    .eq('contract_id', contract.id)
    .order('signed_at', { ascending: true });

  const existingSignatures = (signatures ?? []).map((s: { signer_wallet: string; signed_at: string; signer_identity?: Record<string, unknown> | null }) => ({
    signer_wallet: s.signer_wallet,
    signed_at: s.signed_at,
    signer_identity: s.signer_identity ?? null,
  }));

  // Phase 6: Public amendment history. Fetch all amendment proposals for
  // this contract so the reader can see the negotiation timeline (pending,
  // approved, rejected, escalated). Public metadata — no auth required.
  // Each approved proposal links to the resulting amendment contract by
  // contract_id so the reader can navigate the chain.
  //
  // Cast: the auto-generated Supabase types don't know about amendment_proposals
  // (added after the last `supabase gen types` run). Cast through unknown to a
  // local interface — safe because we own the schema and the columns are stable.
  interface AmendmentProposalRow {
    id: string;
    proposer_wallet: string;
    diff_summary: string | null;
    status: 'pending' | 'approved' | 'rejected' | 'expired' | 'escalated';
    approval_required_from: string;
    approved_by_wallet: string | null;
    approved_at: string | null;
    rejected_reason: string | null;
    expires_at: string | null;
    resulting_contract_id: string | null;
    created_at: string;
    proposed_visibility: 'private' | 'metadata_only' | 'public' | 'encrypted' | null;
  }

  const proposalsResult = await getSupabaseAdmin()
    .from('amendment_proposals')
    .select(
      'id, proposer_wallet, diff_summary, status, approval_required_from, ' +
      'approved_by_wallet, approved_at, rejected_reason, expires_at, ' +
      'resulting_contract_id, created_at, proposed_visibility'
    )
    .eq('original_contract_id', contract.id)
    .order('created_at', { ascending: false });

  const amendmentProposals = (proposalsResult.data as unknown as AmendmentProposalRow[] | null) ?? [];

  // Resolve resulting_contract_id (uuid) to contract_id (amb-...) for each
  // approved proposal so we can link to the resulting amendment by its
  // public identifier instead of an internal uuid.
  const resultingContractIds = amendmentProposals
    .map((p) => p.resulting_contract_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  let resultingContractMap = new Map<string, string>();
  if (resultingContractIds.length > 0) {
    const { data: resultingContracts } = await getSupabaseAdmin()
      .from('contracts')
      .select('id, contract_id')
      .in('id', resultingContractIds);
    resultingContractMap = new Map(
      (resultingContracts ?? []).map((c: { id: string; contract_id: string }) => [c.id, c.contract_id]),
    );
  }

  return (
    <main className="pt-20">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-sm font-mono uppercase tracking-widest text-amber mb-2">
              Contract Reader
            </p>
            <h1 className="text-2xl font-bold text-text-primary">
              {contract.contract_id}
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Created {new Date(contract.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>

          {/* Verification badge */}
          <div
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
              isVerified
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              {isVerified ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              )}
            </svg>
            {isVerified ? 'Hash Verified' : 'Hash Mismatch'}
          </div>
        </div>
        <p className="text-xs text-text-secondary/50 mt-1 text-right">
          Verification confirms technical integrity — not legal certification.
        </p>

        {/* Revocation banner */}
        {contract.revoked_at && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <p className="text-sm font-medium text-red-400">This contract has been revoked</p>
            </div>
            <p className="text-xs text-text-secondary">
              Revoked on {new Date(contract.revoked_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              {contract.revocation_reason && <> — {contract.revocation_reason}</>}
            </p>
            <p className="text-xs text-text-secondary/60 mt-1">
              This contract no longer grants any authority. Actions taken under this contract after revocation are unauthorized.
            </p>
          </div>
        )}

        {/* Expiry banner */}
        {contract.expiry_date && contract.status !== 'revoked' && (
          <div className={`rounded-lg border p-4 mb-6 ${
            new Date(contract.expiry_date) < new Date()
              ? 'border-red-500/40 bg-red-500/5'
              : 'border-yellow-500/40 bg-yellow-500/5'
          }`}>
            <p className={`text-sm font-medium ${new Date(contract.expiry_date) < new Date() ? 'text-red-400' : 'text-yellow-400'}`}>
              {new Date(contract.expiry_date) < new Date() ? 'This contract has expired' : 'This contract has an expiry date'}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              {new Date(contract.expiry_date) < new Date() ? 'Expired' : 'Expires'} on {new Date(contract.expiry_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        )}

        {/* Status + type badges */}
        <div className="flex items-center gap-3 mb-6">
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${
            contract.status === 'revoked'
              ? 'border-red-500/30 bg-red-500/10 text-red-400'
              : 'border-amber/30 bg-amber-glow text-amber'
          }`}>
            {contract.status}
          </span>
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-secondary">
            {contract.amendment_type}
          </span>
          {contract.require_zk_identity && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400 flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              ZK Identity Required
            </span>
          )}
          {!authorized && (
            <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs font-medium text-yellow-400">
              Metadata Only
            </span>
          )}
        </div>

        {/* SHA-256 hash */}
        <div className="flex items-center gap-2 rounded-lg bg-amber-glow border border-amber/20 px-4 py-2 mb-6">
          <span className="text-xs font-medium text-amber">SHA-256</span>
          <code className="font-mono text-xs text-text-secondary break-all">
            {contract.sha256_hash}
          </code>
        </div>

        {authorized ? (
          <>
            {/* Principal Declaration — full access only */}
            {contract.principal_declaration && (
              <div className="rounded-lg border border-border bg-surface-elevated px-4 py-3 mb-6">
                <p className="text-xs font-medium text-amber mb-1">
                  Principal Declaration
                </p>
                <p className="text-sm text-text-primary">
                  Agent{' '}
                  <code className="font-mono text-amber-light">
                    {(contract.principal_declaration as Record<string, string>).agent_id}
                  </code>{' '}
                  acts on behalf of{' '}
                  <span className="font-medium">
                    {(contract.principal_declaration as Record<string, string>).principal_name}
                  </span>{' '}
                  <span className="text-text-secondary">
                    ({(contract.principal_declaration as Record<string, string>).principal_type})
                  </span>
                </p>
              </div>
            )}

            {/* Export buttons — full access only */}
            <ExportButtons
              contractId={contract.contract_id}
              humanReadable={contract.human_readable}
              machineReadable={contract.machine_readable}
              sha256Hash={contract.sha256_hash}
            />

            {/* Wallet signing — show when signable */}
            {['draft', 'handshake', 'pending_signature'].includes(contract.status) && (
              <div className="mb-6">
                <SignContract
                  contractId={contract.contract_id}
                  contractUuid={contract.id}
                  sha256Hash={contract.sha256_hash}
                  status={contract.status}
                  existingSignatures={existingSignatures}
                  requireZkIdentity={contract.require_zk_identity}
                />
              </div>
            )}

            {/* NFT status — show when minted or minting */}
            {contract.nft_mint_status && (
              <div className="mb-6">
                <NftStatus
                  mintStatus={contract.nft_mint_status}
                  tokenId={contract.nft_token_id}
                  txHash={contract.nft_tx_hash}
                  holderWallet={contract.nft_holder_wallet}
                  counterpartyWallet={contract.nft_counterparty_wallet}
                />
              </div>
            )}

            {/* Contract content — full access only */}
            <ContractViewer
              humanReadable={contract.human_readable}
              machineReadable={contract.machine_readable}
            />
          </>
        ) : (
          /* Unauthenticated: show wallet connect OR metadata-only message */
          <div className="space-y-6 mb-6">
            {/* Wallet connect for access */}
            <ReaderAuthGate
              contractId={contract.contract_id}
              contractUuid={contract.id}
            />

            {/* Metadata hint below wallet connect */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="text-xs text-text-secondary">
                You can also access this contract with a{' '}
                <span className="text-amber font-medium">share link</span>{' '}
                from one of the contract parties.
              </p>
            </div>
          </div>
        )}

        {/* Amendment chain link — always visible (metadata) */}
        {contract.parent_contract_hash && (
          <div className="mt-6 rounded-lg border border-border bg-surface p-4">
            <p className="text-xs font-medium text-text-secondary mb-2">
              Amendment of
            </p>
            <a
              href={`/reader/${contract.parent_contract_hash}`}
              className="text-sm font-mono text-amber hover:underline"
            >
              {contract.parent_contract_hash.slice(0, 16)}...
            </a>
          </div>
        )}

        {/* Phase 6: Amendment history — public negotiation timeline.
            Shows every proposal anyone has made on this contract with status,
            who proposed/approved/rejected, and a link to the resulting
            amendment contract if approved. Visible to all viewers — this is
            part of the public audit trail of the contract. */}
        {amendmentProposals.length > 0 && (
          <div className="mt-6 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-amber">Amendment history</p>
              <span className="text-[10px] font-mono text-text-secondary/60">
                {amendmentProposals.filter((p) => p.status === 'pending').length} pending
                {' · '}
                {amendmentProposals.length} total
              </span>
            </div>
            <ol className="space-y-3">
              {amendmentProposals.map((p) => {
                const resultingContractId = p.resulting_contract_id
                  ? resultingContractMap.get(p.resulting_contract_id) ?? null
                  : null;
                return (
                  <li
                    key={p.id}
                    className="rounded border border-border/60 bg-background/50 p-3"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-text-secondary">
                          {p.proposer_wallet.slice(0, 6)}...{p.proposer_wallet.slice(-4)}
                        </span>
                        <span className="text-text-secondary/40">→</span>
                        <span className="font-mono text-text-secondary">
                          {p.approval_required_from.slice(0, 6)}...{p.approval_required_from.slice(-4)}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
                          p.status === 'pending'
                            ? 'text-amber border-amber/30'
                            : p.status === 'approved'
                              ? 'text-emerald-400 border-emerald-500/30'
                              : p.status === 'rejected'
                                ? 'text-red-400 border-red-500/30'
                                : p.status === 'escalated'
                                  ? 'text-orange-400 border-orange-500/30'
                                  : 'text-text-secondary border-border'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    {p.diff_summary && (
                      <p className="text-xs text-text-secondary mb-1.5">{p.diff_summary}</p>
                    )}
                    {p.proposed_visibility && (
                      <p className="text-[11px] font-mono text-amber/80 mb-1.5">
                        Requested visibility change → <span className="uppercase">{p.proposed_visibility}</span>
                      </p>
                    )}
                    <p className="text-[10px] font-mono text-text-secondary/60">
                      Proposed {new Date(p.created_at).toLocaleString()}
                      {p.approved_at && (
                        <>
                          {' · '}Approved {new Date(p.approved_at).toLocaleString()}
                        </>
                      )}
                    </p>
                    {p.status === 'rejected' && p.rejected_reason && (
                      <p className="mt-1.5 text-[11px] text-text-secondary/80">
                        Reason: <span className="text-text-secondary">{p.rejected_reason}</span>
                      </p>
                    )}
                    {p.status === 'escalated' && (
                      <p className="mt-1.5 text-[11px] text-orange-400">
                        EU AI Act Article 14 escalation: spending change exceeded the
                        contract&apos;s oversight threshold. Required direct human
                        principal approval.
                      </p>
                    )}
                    {p.status === 'approved' && resultingContractId && (
                      <a
                        href={`/reader/${resultingContractId}`}
                        className="mt-2 inline-block text-[11px] font-mono text-amber hover:underline"
                      >
                        → resulting amendment: {resultingContractId}
                      </a>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-[10px] text-text-secondary/50 italic">
              Amendment proposals are public metadata. They show the negotiation
              history of this contract regardless of whether the proposal text
              itself is visible.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
