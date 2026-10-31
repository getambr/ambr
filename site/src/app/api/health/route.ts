import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, isAdmin } from '@/lib/api-auth';
// Lives in lib/ rather than inline with the other checks so it can be exercised
// directly — a monitor nobody has watched fail is not known to work.
import { checkInboundMail } from '@/lib/health/inbound-mail';
import {
  checkSupabase,
  checkBaseRpc,
  checkAnthropic,
  checkOpsAgent,
  checkResend,
  checkStripe,
  checkCnftContract,
  checkX402Facilitator,
} from '@/lib/health/checks';
import { overallStatus } from '@/lib/health/rollup';
import { PLATFORM_VERSION } from '@/lib/version';

export async function GET(request: NextRequest) {
  const start = Date.now();

  // Detail (per-service latency, counts, Stripe mode, contract totals) is
  // admin-only. Public callers still get the overall up/down status so
  // external uptime monitors keep working.
  const hasApiKey = !!request.headers.get('x-api-key') || !!request.headers.get('authorization');
  let isAdminCaller = false;
  if (hasApiKey) {
    const auth = await validateApiKey(request);
    isAdminCaller = !!auth && isAdmin(auth.email);
  }

  const [supabase, baseRpc, anthropic, opsAgent, resend, stripe, cnft, x402Facilitator, inboundMail] =
    await Promise.all([
    checkSupabase(),
    checkBaseRpc(),
    checkAnthropic(isAdminCaller),
    checkOpsAgent(),
    checkResend(),
    checkStripe(),
    checkCnftContract(),
    checkX402Facilitator(isAdminCaller),
    // Admin-only. Two extra ops service calls on every uptime-monitor ping would
    // burn URL Fetch quota for data only an admin is shown anyway.
    isAdminCaller ? checkInboundMail() : Promise.resolve(null),
  ]);

  // Services whose health means "the product is up", plus two that are shown
  // but left out of the overall status (see lib/health/rollup): ops_agent, and
  // x402_facilitator, because x402 is one of two payment rails and API keys
  // keep the product up while the facilitator is not.
  // inbound_mail is deliberately absent — see the note above checkInboundMail.
  const checks = {
    supabase,
    base_rpc: baseRpc,
    anthropic,
    ops_agent: opsAgent,
    resend,
    stripe,
    cnft_contract: cnft,
    x402_facilitator: x402Facilitator,
  };
  const overall = overallStatus(checks, ['ops_agent', 'x402_facilitator']);
  const httpStatus = overall === 'healthy' ? 200 : 503;

  if (!isAdminCaller) {
    const publicServices = Object.fromEntries(
      Object.entries(checks).map(([k, v]) => [k, v.status]),
    );
    const cnftAddress = process.env.CNFT_CONTRACT_ADDRESS;
    return NextResponse.json(
      {
        status: overall,
        version: PLATFORM_VERSION,
        timestamp: new Date().toISOString(),
        services: publicServices,
        cnft: cnftAddress
          ? {
              address: cnftAddress,
              basescan_url: `https://basescan.org/address/${cnftAddress}`,
            }
          : null,
      },
      {
        status: httpStatus,
        headers: {
          'Cache-Control': 'public, s-maxage=30',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  return NextResponse.json(
    {
      status: overall,
      version: PLATFORM_VERSION,
      timestamp: new Date().toISOString(),
      total_latency_ms: Date.now() - start,
      checks: inboundMail ? { ...checks, inbound_mail: inboundMail } : checks,
    },
    {
      status: httpStatus,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
