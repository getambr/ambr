import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { validateApiKey, isAdmin } from '@/lib/api-auth';
import { hashContract } from '@/lib/contract-engine';

// Admin-only hash diagnostics + rehash endpoint

function deepSortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepSortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = deepSortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(request);
  if (!auth || !isAdmin(auth.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = getSupabaseAdmin();

  let query = db.from('contracts').select('contract_id, sha256_hash, human_readable, machine_readable');
  if (id.startsWith('amb-')) {
    query = query.eq('contract_id', id);
  } else {
    query = query.eq('sha256_hash', id);
  }

  const { data: contract, error } = await query.single();
  if (error || !contract) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const hr = contract.human_readable as string;
  const mr = contract.machine_readable as Record<string, unknown>;

  // Method 1: deep sort
  const deepJson = JSON.stringify(deepSortKeys(mr));
  const deepCanonical = hr + '\n---\n' + deepJson;
  const deepHash = createHash('sha256').update(deepCanonical, 'utf-8').digest('hex');

  // Method 2: shallow sort (top-level only)
  const shallowKeys = Object.keys(mr).sort();
  const shallowObj = Object.fromEntries(shallowKeys.map((k) => [k, mr[k]]));
  const shallowJson = JSON.stringify(shallowObj);
  const shallowCanonical = hr + '\n---\n' + shallowJson;
  const shallowHash = createHash('sha256').update(shallowCanonical, 'utf-8').digest('hex');

  // Method 3: no sort at all (raw JSON.stringify of what Postgres returned)
  const rawJson = JSON.stringify(mr);
  const rawCanonical = hr + '\n---\n' + rawJson;
  const rawHash = createHash('sha256').update(rawCanonical, 'utf-8').digest('hex');

  // Find differences
  let jsonDiff = null;
  if (deepJson !== shallowJson) {
    for (let i = 0; i < Math.min(deepJson.length, shallowJson.length); i++) {
      if (deepJson[i] !== shallowJson[i]) {
        jsonDiff = { position: i, deep: deepJson.slice(i, i + 80), shallow: shallowJson.slice(i, i + 80) };
        break;
      }
    }
  }

  return NextResponse.json({
    contract_id: contract.contract_id,
    stored_hash: contract.sha256_hash,
    deep_hash: deepHash,
    shallow_hash: shallowHash,
    raw_hash: rawHash,
    deep_matches: deepHash === contract.sha256_hash,
    shallow_matches: shallowHash === contract.sha256_hash,
    raw_matches: rawHash === contract.sha256_hash,
    hr_length: hr.length,
    hr_first_80: hr.slice(0, 80),
    hr_last_80: hr.slice(-80),
    hr_has_html: /<[^>]+>/.test(hr),
    mr_top_keys: Object.keys(mr).sort(),
    mr_deep_json_length: deepJson.length,
    mr_shallow_json_length: shallowJson.length,
    mr_raw_json_length: rawJson.length,
    json_diff: jsonDiff,
    deep_eq_shallow: deepJson === shallowJson,
    deep_eq_raw: deepJson === rawJson,
  });
}

/**
 * POST /api/v1/debug/hash/[id]
 *
 * Admin-only: rehash a contract from its currently stored content.
 * Updates sha256_hash so the Reader shows "Hash Verified" for the
 * actual stored text (even if that text has encoding artifacts).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(request);
  if (!auth || !isAdmin(auth.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = getSupabaseAdmin();

  let query = db.from('contracts').select('id, contract_id, sha256_hash, human_readable, machine_readable');
  if (id.startsWith('amb-')) {
    query = query.eq('contract_id', id);
  } else {
    query = query.eq('sha256_hash', id);
  }

  const { data: contract, error } = await query.single();
  if (error || !contract) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const oldHash = contract.sha256_hash;
  const newHash = hashContract(
    contract.human_readable as string,
    contract.machine_readable as Record<string, unknown>,
  );

  if (oldHash === newHash) {
    return NextResponse.json({
      contract_id: contract.contract_id,
      message: 'Hash already matches stored content',
      hash: oldHash,
      updated: false,
    });
  }

  await db
    .from('contracts')
    .update({ sha256_hash: newHash })
    .eq('id', contract.id);

  return NextResponse.json({
    contract_id: contract.contract_id,
    old_hash: oldHash,
    new_hash: newHash,
    updated: true,
  });
}
