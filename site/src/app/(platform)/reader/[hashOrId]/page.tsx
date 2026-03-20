import { notFound } from 'next/navigation';
import { createHash } from 'crypto';
import { getSupabase } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import ContractViewer from './ContractViewer';
import ExportButtons from './ExportButtons';
import SignContract from '@/components/reader/SignContract';

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
    .select('signer_wallet, signed_at')
    .eq('contract_id', contract.id)
    .order('created_at', { ascending: true });

  const existingSignatures = (signatures ?? []).map((s: { signer_wallet: string; signed_at: string }) => ({
    signer_wallet: s.signer_wallet,
    signed_at: s.signed_at,
  }));

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

        {/* Status + type badges */}
        <div className="flex items-center gap-3 mb-6">
          <span className="rounded-full border border-amber/30 bg-amber-glow px-3 py-1 text-xs font-medium text-amber">
            {contract.status}
          </span>
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-secondary">
            {contract.amendment_type}
          </span>
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
          /* Metadata-only view for unauthenticated visitors */
          <div className="rounded-lg border border-border bg-surface p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <h2 className="text-lg font-semibold text-text-primary">Private Contract</h2>
            </div>
            <p className="text-sm text-text-secondary mb-4">
              This contract exists and its hash has been verified, but the full text is private.
              Only authorized parties can view the complete contract.
            </p>
            <div className="space-y-2 text-sm text-text-secondary">
              <p>To view the full contract, you need a <span className="text-amber font-medium">share link</span> from one of the contract parties.</p>
              <p className="text-xs text-text-secondary/60 mt-3">
                Contract parties can generate share links via the API:
                <code className="ml-1 text-xs font-mono text-amber/70">POST /api/v1/contracts/{'{id}'}/share</code>
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
      </div>
    </main>
  );
}
