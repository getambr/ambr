import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { validateApiKey } from '@/lib/api-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { corsOptions } from '@/lib/cors';
import { CheckInputError } from '@/lib/contract/check-terms';
import {
  canCheckContract,
  checkAgainstAgreement,
  checkTransactionSchema,
  lookupContractForCheck,
} from '@/lib/contract/check-payment';

export const runtime = 'nodejs';

/**
 * POST /api/v1/contracts/[id]/check
 *
 * Check one payment against what an agreement allows: status, validity
 * window, currency, per-transaction and monthly limits, approved categories,
 * enumerated actions and the approval threshold. If the agreement was
 * amended, the newest version is the one checked.
 *
 * Read-only and free: no credits are burned and nothing is stored (apart from
 * an audit-log line). Ambr does not hold funds or track spend, so the monthly
 * limit is only checked when the caller sends `period_spent`.
 *
 * Access follows GET /api/v1/contracts/[id]: a public contract is open to
 * anyone; otherwise send the creator's API key or a share token (?token=).
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const auth = await validateApiKey(request);
  const keyId = auth?.keyId ?? null;

  const rl = rateLimit(`check:${keyId ?? getClientIp(request)}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retry_after_ms: rl.resetAt - Date.now() },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = checkTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        message: 'Body must be { amount, currency?, category?, action?, period_spent? } with amounts of zero or more.',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const found = await lookupContractForCheck(db, id);
  if (!found.ok) return NextResponse.json(found.body, { status: found.status });
  const { contract } = found;

  const shareToken = new URL(request.url).searchParams.get('token');
  if (!(await canCheckContract(db, contract, { keyId, shareToken }))) {
    return NextResponse.json(
      {
        error: 'forbidden',
        message: 'Send the contract creator\'s API key (X-API-Key) or a share token (?token=) to check this contract.',
      },
      { status: 403 },
    );
  }

  try {
    const result = await checkAgainstAgreement(db, contract, parsed.data);
    logAudit({
      event_type: 'contract_check',
      actor: keyId ?? 'anonymous',
      details: {
        contract_id: result.contract_id,
        effective_contract_id: result.effective_contract_id,
        verdict: result.verdict,
      },
      ip_address: getClientIp(request),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof CheckInputError) {
      return NextResponse.json({ error: 'invalid_request', message: err.message }, { status: 400 });
    }
    throw err;
  }
}

export { corsOptions as OPTIONS };
