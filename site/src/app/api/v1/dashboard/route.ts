import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { isAdmin, isTechAdmin } from '@/lib/admin-emails';
import { emailToMemberId } from '@/lib/team-members';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { corsOptions } from '@/lib/cors';
import { PROVEN_BINDING_SOURCES } from '@/lib/contract/account-wallets';

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { error: 'Invalid or missing API key' },
      { status: 401 },
    );
  }

  const db = getSupabaseAdmin();
  const selectCols =
    'contract_id, status, amendment_type, sha256_hash, created_at, updated_at, ' +
    'template_id, principal_declaration, parameters, nft_mint_status, nft_token_id, ' +
    'nft_counterparty_token_id, nft_holder_wallet, nft_counterparty_wallet, ' +
    // tx hashes are needed by the embedded ContractNftViewer for BaseScan links
    'nft_tx_hash, nft_counterparty_tx_hash, ' +
    'visibility, contract_type, payment_method, revoked_at, revoked_by, ' +
    'revocation_reason, expiry_date, parent_contract_hash, ' +
    'oversight_threshold_usd, principal_approval_required, ' +
    // principal_wallet + payer_wallet needed for client-side your_role
    // computation when narrowing to "just my current wallet" (Phase B).
    'principal_wallet, payer_wallet, api_key_id, ' +
    // is_one_sided lets Analytics distinguish unilateral (P2) from bilateral
    // templates without re-joining. Added with the P2 migration 2026-05-26.
    'is_one_sided, ' +
    // Template join — pulls slug + category so Analytics can group by
    // template family (A/C/D/P series) without a second roundtrip.
    'templates ( slug, category ), ' +
    // Signature count — aggregated by Postgrest's relational count modifier.
    // Returns [{count: N}] which we flatten below.
    'signatures ( count )';

  // Pull all wallets bound to this account from account_wallets — this is the
  // canonical "your wallets" set. Returns 0+ rows. Falls back gracefully if
  // the table isn't there (migration not applied) — we just use the auth's
  // principalWallet as the only known wallet.
  // Proven bindings only. The wallet arms below widen the query past this
  // account's own contracts, so a wallet in this set can pull in rows the
  // account does not own. account_wallets does not establish control: two of
  // its sources are unproven. `auto_deploy` writes whatever address was typed
  // into a deploy body, and `auto_backfill` sweeps in any wallet that has ever
  // signed one of the account's contracts, which is the counterparty's wallet,
  // not ours. Including them would make contracts visible to accounts that do
  // not own them.
  //
  // `auto_wallet_auth` and `manual` are the sources that carry proof: the
  // former verifies an ECDSA signature before writing, the latter is a
  // deliberate act by the account holder.
  //
  // Filtering to proven sources costs nothing: same-account matches are already
  // returned by the `api_key_id` arm, so no legitimate row disappears.

  let boundWallets: string[] = [];
  try {
    const { data: bindings } = await db
      .from('account_wallets')
      .select('wallet_address')
      .eq('api_key_id', auth.keyId)
      .in('source', PROVEN_BINDING_SOURCES);
    boundWallets = (bindings || []).map((b) => b.wallet_address.toLowerCase());
  } catch {
    // table missing or query failed — fall through with empty set
  }
  // Always include the auth.principalWallet if it exists and isn't already
  // in the bound set (covers the case where the user is mid-handshake or
  // the binding upsert is still propagating).
  const authWallet = auth.principalWallet?.toLowerCase();
  if (authWallet && !boundWallets.includes(authWallet)) {
    boundWallets.push(authWallet);
  }

  // Fetch contracts: deployed under this account (api_key match) UNION any
  // contract where one of the user's bound wallets is on-chain as a party
  // (principal / payer / nft_holder / nft_counterparty). Captures contracts
  // the user is a counterparty on without having deployed them, plus the
  // novation case where the cNFT was transferred to one of their wallets.
  let orClause = `api_key_id.eq.${auth.keyId}`;
  if (boundWallets.length > 0) {
    // PostgREST `in.(a,b,c)` is the correct multi-value match. Each ilike()
    // would require N clauses; in() handles it in one. Wallets already
    // lowercased above; the columns are also stored lowercased per the
    // contracts insert path. So plain `in.(...)` (not `ilike.in`) is fine.
    const list = boundWallets.join(',');
    orClause +=
      `,principal_wallet.in.(${list})` +
      `,payer_wallet.in.(${list})` +
      `,nft_holder_wallet.in.(${list})` +
      `,nft_counterparty_wallet.in.(${list})`;
  }

  const { data: contracts } = await db
    .from('contracts')
    .select(selectCols)
    .or(orClause)
    .order('created_at', { ascending: false })
    .limit(100); // bumped from 50 — union surface is wider than api_key-only

  // Flatten relational joins back into a flat shape the client expects.
  // - templates(slug, category) → template_slug + template_category top-level
  // - signatures(count) → signature_count top-level
  // Keep the original columns intact so existing consumers don't break.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flatContracts = (contracts ?? []).map((c: any) => {
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

  return NextResponse.json({
    user: {
      email: auth.email,
      tier: auth.tier,
      credits: auth.credits,
      key_prefix: 'amb_****',
      beta_features: auth.betaFeatures,
      // Phase B: client needs api_key_id to compute the 'deployer-only' role
      // (your account deployed but no wallet of yours is on-chain). Safe to
      // expose — it's already the client's session key; they sent it.
      api_key_id: auth.keyId,
      // Computed here so the browser never receives the admin roster. The
      // dashboard previously imported the list and matched client-side, which
      // shipped three real addresses into a public JS chunk. A boolean about
      // *you* discloses nothing about anyone else.
      is_admin: isAdmin(auth.email),
      is_tech_admin: isTechAdmin(auth.email),
      // Opaque handle for this person. The email widget keys its alias maps and
      // its assignment UI by member, and now does so without ever holding a
      // real address. Null for anyone off the roster.
      team_member_id: emailToMemberId(auth.email),
    },
    wallet: authWallet ?? null,
    // Expose the bound-wallet set so the front-end can compute per-contract
    // role badges ('deployer' / 'principal' / 'counterparty' / 'signer') and
    // power the "Just my current wallet" filter chip locally without
    // re-querying the server on every toggle.
    bound_wallets: boundWallets,
    contracts: flatContracts,
  });
}

export { corsOptions as OPTIONS };
