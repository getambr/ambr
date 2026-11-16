import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { validateApiKey } from '@/lib/api-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { corsOptions } from '@/lib/cors';
import { CheckInputError } from '@/lib/contract/check-terms';
import {
  checkTransactionSchema,
  lookupContractForCheck,
  runCheck,
} from '@/lib/contract/check-payment';

export const runtime = 'nodejs';

/**
 * POST /api/v1/contracts/[id]/check
 *
 * Check one payment against the limits of an agreement: status, validity
 * window, currency, per-transaction and monthly limits, a total budget, a
 * price or fee, the approval and escalation thresholds, and the exact match of
 * the caller's category and action labels against the agreement's lists. The
 * limits are read from the form answers stored with the agreement
 * (contracts.parameters), for the templates the check knows; machine_readable
 * is only scanned for figures and statements the answers do not explain. If the
 * agreement was amended, the newest approved version is the one checked.
 *
 * The verdict is within_limits, out_of_scope, needs_approval, or incomplete (a
 * limit needs an input the request did not send, or the agreement states a
 * figure or a contradiction the check could not place). within_limits says
 * only that the figures passed: the human-readable agreement is not read, and
 * the response's not_checked lists, by path and never the text, parts for the
 * caller to start reading (a best-effort hint, not a complete list: the caller
 * must read the agreement's scope and conditions itself). A miss on a permitted-action
 * or category list found only in the agreement's text is incomplete, never out_of_scope. also_incomplete marks a needs_approval answer that
 * also has limits the check could not evaluate.
 *
 * Read-only and free: no credits are burned and nothing is stored (apart from
 * an audit-log line). Ambr does not hold funds or track spend, so a limit on
 * what was spent so far is only checked when the caller sends `period_spent`.
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

  try {
    const run = await runCheck(db, contract, parsed.data, { keyId, shareToken });
    if (run.forbidden) {
      return NextResponse.json(
        {
          error: 'forbidden',
          message: 'Send the contract creator\'s API key (X-API-Key) or a share token (?token=) to check this contract.',
        },
        { status: 403 },
      );
    }
    const { result } = run;
    // Awaited: Vercel can drop work that is still running after the response.
    await logAudit({
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
