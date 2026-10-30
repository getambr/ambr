import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { contractRefColumn, INVALID_CONTRACT_REF, type ContractRefColumn } from '@/lib/contract/lookup';
import { validateApiKey } from '@/lib/api-auth';
import { corsOptions } from '@/lib/cors';
import { verifyLei } from '@/lib/adapters/vet/demos-dahr';
import { isLei } from '@/lib/dacs/recipes';
import type { VerifyResult } from '@/lib/dacs/types';

/**
 * POST /api/v1/contracts/[id]/verify-party  — DACS-2 Vet
 * GET  /api/v1/contracts/[id]/verify-party  — list stored verifications
 *
 * Owner-only (the api_key that created the contract). Verifies a named party's
 * credential against an authoritative registry and stamps a DACS VerifyResult.
 * MVP scheme: `lei` (GLEIF). The actual registry call goes through Demos DAHR
 * and is FEATURE-FLAGGED off (returns `indeterminate`) until a Demos wallet+node
 * is wired — see src/lib/adapters/vet/demos-dahr.ts.
 *
 * DB persistence (counterparty_verifications) + audit are BEST-EFFORT: a missing
 * table or insert failure never fails the verification response. This keeps the
 * feature safe to ship before the migration is applied to prod.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadContract(db: any, id: string, column: ContractRefColumn) {
  const { data } = await db
    .from('contracts')
    .select('id, contract_id, api_key_id, parameters')
    .eq(column, id)
    .single();
  return data;
}

/** Best-guess of the contract's stated name for a given party role. */
function partyNameFor(parameters: Record<string, unknown> | null, role: string): string | undefined {
  const p = parameters ?? {};
  const candidates = [
    `${role}_name`,
    role === 'seller' || role === 'provider' ? 'provider_name' : '',
    role === 'buyer' ? 'consumer_name' : '',
    'principal_name',
  ].filter(Boolean) as string[];
  for (const k of candidates) {
    if (typeof p[k] === 'string' && (p[k] as string).trim()) return p[k] as string;
  }
  return undefined;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getSupabaseAdmin();

  const auth = await validateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized', message: 'API key required' }, { status: 401 });
  }

  const column = contractRefColumn(id);
  if (!column) {
    return NextResponse.json(INVALID_CONTRACT_REF, { status: 400 });
  }

  const contract = await loadContract(db, id, column);
  if (!contract) {
    return NextResponse.json({ error: 'not_found', message: 'Contract not found' }, { status: 404 });
  }
  if (contract.api_key_id !== auth.keyId) {
    return NextResponse.json({ error: 'forbidden', message: 'Only the contract owner can verify a party' }, { status: 403 });
  }

  let body: { party_role?: string; scheme?: string; identifier?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 });
  }

  const partyRole = (body.party_role ?? 'principal').toString();
  const scheme = (body.scheme ?? 'lei').toString();
  const identifier = (body.identifier ?? '').toString().trim();

  if (scheme !== 'lei') {
    return NextResponse.json({ error: 'unsupported_scheme', message: `Scheme '${scheme}' is not supported yet (MVP: lei).` }, { status: 400 });
  }
  if (!identifier || !isLei(identifier)) {
    return NextResponse.json({ error: 'bad_identifier', message: 'A valid 20-character LEI is required.' }, { status: 400 });
  }

  const expectedName = partyNameFor(contract.parameters, partyRole);
  const result: VerifyResult = await verifyLei(identifier, expectedName);

  // Best-effort persistence — never fail the verification because of it.
  try {
    await db.from('counterparty_verifications').insert({
      contract_id: contract.id,
      party_role: partyRole,
      scheme,
      identifier: result.identifier,
      decision: result.decision,
      verify_result: result,
      dahr_tx_hash: result.attestation.anchor.kind === 'demos-web2' ? result.attestation.anchor.locator : null,
    });
  } catch {
    /* table may not exist yet (migration pending) — degrade gracefully */
  }
  try {
    await db.from('audit_log').insert({
      contract_id: contract.id,
      action: 'party_verified',
      actor: auth.email,
      details: { party_role: partyRole, scheme, identifier: result.identifier, decision: result.decision },
    });
  } catch {
    /* audit is non-critical */
  }

  return NextResponse.json({ verify_result: result }, { status: 200 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getSupabaseAdmin();

  const auth = await validateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized', message: 'API key required' }, { status: 401 });
  }
  const column = contractRefColumn(id);
  if (!column) {
    return NextResponse.json(INVALID_CONTRACT_REF, { status: 400 });
  }
  const contract = await loadContract(db, id, column);
  if (!contract) {
    return NextResponse.json({ error: 'not_found', message: 'Contract not found' }, { status: 404 });
  }
  if (contract.api_key_id !== auth.keyId) {
    return NextResponse.json({ error: 'forbidden', message: 'Not the contract owner' }, { status: 403 });
  }

  let verifications: unknown[] = [];
  try {
    const { data } = await db
      .from('counterparty_verifications')
      .select('party_role, scheme, identifier, decision, verify_result, dahr_tx_hash, verified_at')
      .eq('contract_id', contract.id)
      .order('verified_at', { ascending: false });
    verifications = data ?? [];
  } catch {
    verifications = [];
  }

  return NextResponse.json({ verifications });
}

export { corsOptions as OPTIONS };
