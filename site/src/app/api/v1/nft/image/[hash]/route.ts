import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { corsOptions } from '@/lib/cors';
import { extractPartyNames } from '@/lib/contract/party-names';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  const hash = (await params).hash;

  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return new NextResponse('Invalid hash', { status: 400 });
  }

  // Role-aware rendering. ?role=counterparty produces the COUNTERPARTY-side
  // image (paired-cNFT design). Default is principal for back-compat with any
  // external caller (e.g. an OpenSea image fetch) that doesn't know about the
  // query param. Each role becomes a distinct cache key, so the two paired
  // tokens get different images without collision.
  const url = new URL(request.url);
  const roleParam = url.searchParams.get('role');
  const role: 'principal' | 'counterparty' =
    roleParam === 'counterparty' ? 'counterparty' : 'principal';

  const db = getSupabaseAdmin();
  const { data: contract } = await db
    .from('contracts')
    .select('contract_id, status, principal_declaration, nft_token_id, nft_counterparty_token_id, contract_type, template_id, parameters, visibility')
    .eq('sha256_hash', hash)
    .single();

  if (!contract) {
    return new NextResponse('Not found', { status: 404 });
  }

  // Template-aware party names (matches what the dashboard + reader cards
  // already use via extractPartyNames). Falls back to principal_declaration
  // for backward-compat on contracts deployed before that helper was wired in.
  const { principalName, counterpartyName } = extractPartyNames(
    contract.contract_type ?? contract.template_id,
    (contract.parameters as Record<string, unknown>) ?? {},
  );
  const fallbackPrincipal = (contract.principal_declaration as Record<string, string>)?.principal_name;
  const roleLabel = role === 'counterparty' ? 'COUNTERPARTY' : 'PRINCIPAL';

  // This endpoint is unauthenticated by necessity (wallets and marketplaces
  // fetch it anonymously), so it must apply the same redaction the metadata
  // route applies, with the same predicate. Otherwise .../metadata returns
  // principal_name 'Redacted' and then points `image` at this route, which
  // paints the real legal name into the SVG for every private contract, undoing
  // the redaction through the picture it links to. Keep this condition
  // identical to the one in src/app/api/v1/nft/by-hash/[hash]/metadata/route.ts
  // or they diverge.
  const visibility = (contract.visibility as string) || 'private';
  const redactParties = visibility === 'private' || visibility === 'encrypted';

  const partyName = redactParties
    ? 'Redacted'
    : role === 'counterparty'
      ? (counterpartyName ?? 'Counterparty')
      : (principalName ?? fallbackPrincipal ?? 'Unknown');
  const tokenIdForRole = role === 'counterparty'
    ? contract.nft_counterparty_token_id
    : contract.nft_token_id;
  const hashShort = hash.slice(0, 16);
  const tokenLabel = tokenIdForRole ? `#${tokenIdForRole}` : '';

  // Status badge width — give the pill ~9px per character plus 24px padding so
  // 'pending_signature' (longest legitimate value) fits cleanly without overlap.
  const statusBadgeWidth = Math.max(48, contract.status.length * 7 + 22);

  // Brand-aligned SVG.
  // Palette synced to site/src/app/globals.css:
  //   --color-background  #0a0a0a   --color-surface       #111111
  //   --color-amber       #c6a87c   --color-border        #2E2E2E
  //   --color-text-primary #f4f4f0  --color-text-secondary #999999
  // Flat fill (no gradient) + no outer border — the React card already provides
  // the frame, so we drop the nested-card chrome the previous design had.
  // Serif AMBR wordmark uses Georgia as the system fallback for Instrument Serif.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250">
  <rect width="400" height="250" fill="#0a0a0a"/>

  <text x="24" y="38" font-family="Georgia, 'Times New Roman', serif" font-size="17" font-weight="600" fill="#c6a87c" letter-spacing="0.5">Ambr</text>
  <text x="376" y="38" text-anchor="end" font-family="ui-monospace, 'JetBrains Mono', monospace" font-size="11" fill="#999999">Contract NFT ${tokenLabel}</text>

  <line x1="24" y1="56" x2="376" y2="56" stroke="#2E2E2E" stroke-width="1"/>

  <text x="24" y="92" font-family="ui-monospace, 'JetBrains Mono', monospace" font-size="20" font-weight="500" fill="#f4f4f0" letter-spacing="0.5">${contract.contract_id}</text>

  <rect x="24" y="106" width="${statusBadgeWidth}" height="22" rx="11" fill="#c6a87c" fill-opacity="0.15"/>
  <text x="${24 + statusBadgeWidth / 2}" y="121" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="500" fill="#c6a87c" letter-spacing="0.8">${contract.status.toUpperCase()}</text>

  <text x="24" y="160" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="#666666" letter-spacing="1">${roleLabel}</text>
  <text x="24" y="180" font-family="system-ui, -apple-system, sans-serif" font-size="14" fill="#f4f4f0">${escapeXml(partyName)}</text>

  <text x="24" y="208" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="#666666" letter-spacing="1">SHA-256</text>
  <text x="24" y="226" font-family="ui-monospace, 'JetBrains Mono', monospace" font-size="11" fill="#999999">${hashShort}…</text>

  <text x="376" y="240" text-anchor="end" font-family="ui-monospace, 'JetBrains Mono', monospace" font-size="9" fill="#666666">getamber.dev/reader/${hashShort.slice(0, 8)}…</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      // 5-min fresh cache + 24h SWR. SVG design changes propagate within
      // minutes to all viewers without requiring a code-side cache bump
      // (the ?v=N pattern in ContractNftViewer is still our explicit
      // invalidation signal for major redesigns). Previous 24h max-age was
      // too aggressive when SVG content tracks contract state (status flips
      // between draft/pending_signature/active need to be visible promptly)
      // and meant a brand redesign took 24h to land for any user who'd
      // previously viewed the same contract.
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    },
  });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export { corsOptions as OPTIONS };
