import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyMessage } from 'ethers';
import { corsOptions } from '@/lib/cors';
import { bindWalletToAccount } from '@/lib/contract-engine';
import { isAdmin, isTechAdmin } from '@/lib/admin-emails';
import { emailToMemberId } from '@/lib/team-members';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { wallet_address, signature, message } = body as {
    wallet_address?: string;
    signature?: string;
    message?: string;
  };

  if (!wallet_address || !signature || !message) {
    return NextResponse.json(
      { error: 'validation_error', message: 'Required: wallet_address, signature, message' },
      { status: 400 },
    );
  }

  // Verify ECDSA signature
  let recoveredAddress: string;
  try {
    recoveredAddress = verifyMessage(message, signature);
  } catch {
    return NextResponse.json(
      { error: 'invalid_signature', message: 'Signature verification failed' },
      { status: 400 },
    );
  }

  if (recoveredAddress.toLowerCase() !== wallet_address.toLowerCase()) {
    return NextResponse.json(
      { error: 'signature_mismatch', message: 'Recovered address does not match wallet_address' },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const addr = wallet_address.toLowerCase();

  // Find API key associated with this wallet via tx_from (x402 payment wallet)
  const { data: apiKey } = await db
    .from('api_keys')
    .select('id, email, credits, tier, key_prefix, is_active')
    .ilike('tx_from', addr)
    .eq('is_active', true)
    .limit(1)
    .single();

  // Also check x402_payments for a wallet that paid for contracts
  let keyFromPayments: typeof apiKey = null;
  if (!apiKey) {
    const { data: payment } = await db
      .from('x402_payments')
      .select('contract_id')
      .ilike('payer_wallet', addr)
      .not('contract_id', 'is', null)
      .limit(1)
      .single();

    if (payment?.contract_id) {
      // Find the api_key_id from the contract
      const { data: contract } = await db
        .from('contracts')
        .select('api_key_id')
        .eq('id', payment.contract_id)
        .single();

      if (contract?.api_key_id) {
        const { data: key } = await db
          .from('api_keys')
          .select('id, email, credits, tier, key_prefix, is_active')
          .eq('id', contract.api_key_id)
          .eq('is_active', true)
          .single();
        keyFromPayments = key;
      }
    }
  }

  const resolvedKey = apiKey || keyFromPayments;

  // If we resolved an api_key for this wallet, lock the binding in
  // account_wallets so the dashboard's wallet-centric contract list can
  // find it without re-traversing the fuzzy joins above. The handshake is
  // a cryptographic proof that this wallet belongs to whoever holds the
  // key, so it's the strongest binding signal we have.
  if (resolvedKey) {
    await bindWalletToAccount({
      apiKeyId: resolvedKey.id,
      wallet: addr,
      source: 'auto_wallet_auth',
    });
  }

  // Full column list — must stay in sync with /api/v1/dashboard/route.ts selectCols.
  // wallet-auth returns contracts to the dashboard client; the client renders
  // ContractNftViewer, ContractAnalytics, role badges, etc. using the same
  // ContractRow interface, so every field the main dashboard selects must be
  // present here too. This was the root cause of cNFT data not appearing when
  // users logged in via wallet signature instead of API key.
  const FULL_CONTRACT_SELECT =
    'contract_id, status, amendment_type, sha256_hash, created_at, updated_at, ' +
    'template_id, principal_declaration, parameters, nft_mint_status, nft_token_id, ' +
    'nft_counterparty_token_id, nft_holder_wallet, nft_counterparty_wallet, ' +
    'nft_tx_hash, nft_counterparty_tx_hash, ' +
    'visibility, contract_type, payment_method, revoked_at, revoked_by, ' +
    'revocation_reason, expiry_date, parent_contract_hash, ' +
    'oversight_threshold_usd, principal_approval_required, ' +
    'principal_wallet, payer_wallet, api_key_id, ' +
    'is_one_sided, ' +
    'templates ( slug, category ), ' +
    'signatures ( count )';

  // Gather all contracts associated with this wallet (via multiple paths)
  // 1. Contracts from API key
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let apiKeyContracts: any[] = [];
  if (resolvedKey) {
    const { data } = await db
      .from('contracts')
      .select(FULL_CONTRACT_SELECT)
      .eq('api_key_id', resolvedKey.id)
      .order('created_at', { ascending: false })
      .limit(50);
    apiKeyContracts = data || [];
  }

  // 2. Contracts where wallet is a signer
  const { data: signedContracts } = await db
    .from('signatures')
    .select('contract_id')
    .ilike('signer_wallet', addr);

  // 3. Contracts where wallet did a handshake
  const { data: handshakeContracts } = await db
    .from('handshakes')
    .select('contract_id')
    .ilike('wallet_address', addr);

  // 4. Contracts where wallet is NFT holder or counterparty
  const { data: nftContracts } = await db
    .from('contracts')
    .select('id')
    .or(`nft_holder_wallet.ilike.${addr},nft_counterparty_wallet.ilike.${addr}`);

  // 5. Contracts where wallet is the payer
  const { data: payerContracts } = await db
    .from('contracts')
    .select('id')
    .ilike('payer_wallet', addr);

  // Collect all unique contract UUIDs from wallet associations
  const walletContractIds = new Set<string>();
  signedContracts?.forEach((s) => walletContractIds.add(s.contract_id));
  handshakeContracts?.forEach((h) => walletContractIds.add(h.contract_id));
  nftContracts?.forEach((c) => walletContractIds.add(c.id));
  payerContracts?.forEach((c) => walletContractIds.add(c.id));

  // Fetch full contract data for wallet-associated contracts not already in apiKeyContracts
  const additionalIds = [...walletContractIds].filter((id) => {
    // apiKeyContracts uses contract_id (amb-xxx), walletContractIds uses uuid
    // We need to check by uuid — fetch those that aren't already included
    return !apiKeyContracts.some((c) => {
      const contractRow = c as { id?: string };
      return contractRow.id === id;
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let walletOnlyContracts: any[] = [];
  if (additionalIds.length > 0) {
    const { data } = await db
      .from('contracts')
      .select(FULL_CONTRACT_SELECT)
      .in('id', additionalIds)
      .order('created_at', { ascending: false })
      .limit(50);
    walletOnlyContracts = data || [];
  }

  // Merge: API key contracts first, then wallet-only contracts (deduplicated)
  const seenIds = new Set(apiKeyContracts.map((c) => (c as Record<string, unknown>).contract_id));
  const merged = [
    ...apiKeyContracts,
    ...walletOnlyContracts.filter((c) => !seenIds.has((c as Record<string, unknown>).contract_id)),
  ];

  // Flatten relational joins — same transformation as /api/v1/dashboard/route.ts.
  // templates(slug, category) → template_slug + template_category
  // signatures(count) → signature_count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allContracts = merged.map((c: any) => {
    const template = c.templates as { slug?: string; category?: string } | null;
    const sigAgg = c.signatures as Array<{ count: number }> | null;
    return {
      ...c,
      template_slug: template?.slug ?? null,
      template_category: template?.category ?? null,
      signature_count: sigAgg?.[0]?.count ?? 0,
      templates: undefined,
      signatures: undefined,
    };
  });

  // Expose bound wallets so the client can compute per-contract role badges.
  // At minimum the authenticated wallet itself; include all account_wallets
  // bindings if we resolved an API key.
  let boundWallets: string[] = [addr];
  if (resolvedKey) {
    const { data: bindings } = await db
      .from('account_wallets')
      .select('wallet_address')
      .eq('api_key_id', resolvedKey.id);
    const fromBindings = (bindings || []).map((b) => b.wallet_address.toLowerCase());
    boundWallets = [...new Set([addr, ...fromBindings])];
  }

  // If no API key and no contracts found, wallet is not associated with anything
  if (!resolvedKey && allContracts.length === 0) {
    return NextResponse.json(
      { error: 'wallet_not_found', message: 'No API key or contracts associated with this wallet' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    authorized: true,
    auth_method: 'wallet',
    user: resolvedKey
      ? {
          email: resolvedKey.email,
          tier: resolvedKey.tier,
          credits: resolvedKey.credits,
          key_prefix: resolvedKey.key_prefix || 'amb_****',
          // Same reason as the api-key path in ../route.ts: the admin roster
          // stays server-side and the client is told only about itself. Both
          // entry points must set this or wallet sign-in silently loses the
          // admin surfaces.
          is_admin: isAdmin(resolvedKey.email),
          is_tech_admin: isTechAdmin(resolvedKey.email),
          // Opaque handle for this person. The email widget keys its alias maps and
          // its assignment UI by member, and now does so without ever holding a
          // real address. Null for anyone off the roster.
          team_member_id: emailToMemberId(resolvedKey.email),
        }
      : null,
    wallet: addr,
    bound_wallets: boundWallets,
    contracts: allContracts,
  });
}

export { corsOptions as OPTIONS };
