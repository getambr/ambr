import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  const hash = (await params).hash;

  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return new NextResponse('Invalid hash', { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: contract } = await db
    .from('contracts')
    .select('contract_id, status, principal_declaration, nft_token_id')
    .eq('sha256_hash', hash)
    .single();

  if (!contract) {
    return new NextResponse('Not found', { status: 404 });
  }

  const principal = (contract.principal_declaration as Record<string, string>)?.principal_name || 'Unknown';
  const hashShort = hash.slice(0, 16);
  const tokenLabel = contract.nft_token_id ? `#${contract.nft_token_id}` : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0c0a09"/>
      <stop offset="100%" stop-color="#1c1917"/>
    </linearGradient>
  </defs>
  <rect width="400" height="250" rx="16" fill="url(#bg)"/>
  <rect x="1" y="1" width="398" height="248" rx="15" fill="none" stroke="#d97706" stroke-opacity="0.3"/>

  <text x="24" y="36" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="#d97706">AMBR</text>
  <text x="70" y="36" font-family="system-ui,sans-serif" font-size="11" fill="#a8a29e">Contract NFT ${tokenLabel}</text>

  <text x="24" y="72" font-family="monospace" font-size="18" font-weight="600" fill="#fafaf9">${contract.contract_id}</text>

  <rect x="24" y="86" width="${contract.status.length * 8 + 16}" height="22" rx="11" fill="#d97706" fill-opacity="0.15"/>
  <text x="32" y="101" font-family="system-ui,sans-serif" font-size="11" fill="#d97706">${contract.status}</text>

  <text x="24" y="140" font-family="system-ui,sans-serif" font-size="11" fill="#78716c">Principal</text>
  <text x="24" y="158" font-family="system-ui,sans-serif" font-size="14" fill="#e7e5e4">${escapeXml(principal)}</text>

  <text x="24" y="195" font-family="system-ui,sans-serif" font-size="11" fill="#78716c">SHA-256</text>
  <text x="24" y="213" font-family="monospace" font-size="12" fill="#a8a29e">${hashShort}...</text>

  <line x1="24" y1="232" x2="376" y2="232" stroke="#78716c" stroke-opacity="0.2"/>
  <text x="24" y="244" font-family="system-ui,sans-serif" font-size="9" fill="#57534e">getamber.dev/reader/${hashShort}...</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
