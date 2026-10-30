import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { contractRefColumn, INVALID_CONTRACT_REF } from '@/lib/contract/lookup';
import { verifyMessage } from 'ethers';
import { mintContractNFTAsync } from '@/lib/chain/cnft-mint';
import { getMetadataUri } from '@/lib/chain/cnft-metadata';
import { corsOptions } from '@/lib/cors';
import { DemosIdentityAdapter } from '@/lib/adapters/identity/demos';
import type { IdentityAttestationPayload } from '@/lib/zk/types';
import { notifyContract } from '@/lib/email/notify-contract';
import { validateApiKey } from '@/lib/api-auth';
import {
  canSignAs,
  missingSlots,
  normalizeWallet,
  openSlots,
  resolveSignerParties,
  type SignAuth,
  type SignerSlot,
} from '@/lib/contract/signers';
import { isInviteToken } from '@/lib/contract/share-token';
import { loadAccountWallets } from '@/lib/contract/account-wallets';
import { nextSigningStatus } from '@/lib/contract/signing-transitions';

export const runtime = 'nodejs';
// 120s gives the function enough time to AWAIT the cNFT mint on Base mainnet
// (mintContractNFTAsync — typical 30-60s for tx submission + receipt). The
// previous fire-and-forget approach left mints stuck at `pending` because
// Vercel terminated the function within ~10s of the HTTP response, killing
// the in-flight tx.wait(). Confirmed via amb-2026-0027 2026-05-19 07:37 UTC.
export const maxDuration = 120;

/**
 * POST /api/v1/contracts/[id]/sign
 *
 * Sign a contract with an ECDSA wallet signature.
 * Stores the signature and transitions contract status.
 *
 * The signature proves the signer holds the wallet; who the wallet may sign as
 * comes from lib/contract/signers.ts. A wallet declared in the contract signs
 * without an API key. A slot with no declared wallet is open, and a stranger
 * could fill it (contract ids are sequential and the hash is public), so:
 *   - an open principal side needs the creator: the creating account's bound
 *     wallet when it has one (its API key alone is then refused), else the
 *     creating API key (X-API-Key or Authorization: Bearer); for an x402
 *     contract, the wallet that paid
 *   - an open counterparty side needs the invite token from POST /share, sent
 *     as `share_token` in the body (full access; a scope token is not enough)
 * Existing signatures are counted by validity exactly as before; this gates
 * new ones only.
 */

/**
 * Whether the signing wallet may fill the open principal slot as the creator
 * (see the header).
 *
 * Wallet-first, as in lib/approval-auth.ts: when the creating account has a
 * bound wallet, only that wallet qualifies and its API key alone is refused,
 * because the agent usually holds the key and must not sign for its principal.
 *
 * An account with no bound wallet has only the key to go on. That narrows
 * the slot from anyone to whoever holds the creating key; it does not prove a
 * human, so an agent holding the key can still sign the principal slot itself.
 * It closes when the account binds a wallet (or, later, a human-only step such
 * as an email code exists). Until then the key path is kept so such accounts
 * can still sign their own contracts.
 */
async function requestIsCreator(
  contract: { api_key_id: string | null; payer_wallet: string | null; principal_declaration?: unknown },
  wallet: string,
  holdsCreatingKey: boolean,
): Promise<boolean> {
  if (contract.api_key_id) {
    const agent = (contract.principal_declaration as { agent_id?: unknown } | null)?.agent_id;
    // Proven bindings only (account-wallets.ts): a wallet that merely signed
    // or was typed at deploy time proves nothing about who owns the account.
    const { all } = await loadAccountWallets(contract.api_key_id, agent);
    if (all.length > 0) return all.includes(wallet.toLowerCase());
    return holdsCreatingKey;
  }
  // x402-created: there is no key, so the wallet that paid is the creator.
  const payer = normalizeWallet(contract.payer_wallet);
  return payer !== null && payer === wallet.toLowerCase();
}

/**
 * The slot each signature row records (signatures.slot, unique per contract),
 * by wallet. Two open slots cannot be told apart without it. Rows from before
 * slots were recorded have none and are matched by who fits, as before.
 */
function placedOf(rows: { signer_wallet?: unknown; slot?: unknown }[] | null): Record<string, SignerSlot> {
  const placed: Record<string, SignerSlot> = {};
  for (const r of rows ?? []) {
    if (r.slot === 'principal' || r.slot === 'counterparty') {
      placed[String(r.signer_wallet).toLowerCase()] = r.slot;
    }
  }
  return placed;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { wallet_address, signature, message, identity_attestation, signer_email, share_token } = body as {
    wallet_address?: string;
    signature?: string;
    message?: string;
    identity_attestation?: IdentityAttestationPayload;
    signer_email?: string;       // Optional — if provided, signer gets activation email
    share_token?: string;        // The invite from POST /share; needed to fill an open counterparty slot
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

  let query = db
    .from('contracts')
    .select('id, contract_id, status, sha256_hash, visibility, require_zk_identity, api_key_id, payer_wallet, principal_wallet, principal_declaration, counterparty_email, is_one_sided, parameters');
  const column = contractRefColumn(id);
  if (!column) {
    return NextResponse.json(INVALID_CONTRACT_REF, { status: 400 });
  }
  query = query.eq(column, id);

  const { data: contract, error: contractError } = await query.single();

  if (contractError || !contract) {
    return NextResponse.json(
      { error: 'not_found', message: 'Contract not found' },
      { status: 404 },
    );
  }

  // Terminal contracts cannot collect new signatures. Without this gate a
  // signature row would still be inserted (the status update is skipped when
  // nothing transitions) and the route would report success on a contract the
  // principal already revoked.
  if (['revoked', 'expired', 'terminated', 'amended', 'fulfilled'].includes(contract.status)) {
    return NextResponse.json(
      {
        error: 'invalid_status',
        message: `Cannot sign a contract with status '${contract.status}'.`,
      },
      { status: 422 },
    );
  }

  // Held for a human (EU AI Act Art. 14): the principal's approval moves it to
  // draft, and only then can it be signed. A signature taken now would sit on
  // a contract the database will not let it activate.
  if (contract.status === 'awaiting_principal_approval') {
    return NextResponse.json(
      {
        error: 'awaiting_principal_approval',
        message:
          'This contract is waiting for the principal to approve it and cannot be signed yet. Sign again once it has been approved.',
      },
      { status: 409 },
    );
  }

  if (!message.includes(contract.sha256_hash)) {
    return NextResponse.json(
      { error: 'hash_mismatch', message: 'Signed message must contain the contract SHA-256 hash' },
      { status: 400 },
    );
  }

  // ZK Identity verification — required when contract has require_zk_identity
  let identityResult: Record<string, unknown> | null = null;
  if (contract.require_zk_identity) {
    if (!identity_attestation) {
      return NextResponse.json(
        { error: 'identity_required', message: 'This contract requires ZK identity verification. Provide identity_attestation in the request body.' },
        { status: 400 },
      );
    }

    const adapter = new DemosIdentityAdapter();
    const result = await adapter.verify(JSON.stringify(identity_attestation), wallet_address);
    if (!result || !result.verified) {
      return NextResponse.json(
        { error: 'identity_verification_failed', message: 'ZK identity proof verification failed. Generate a valid proof via the DemosSDK.' },
        { status: 400 },
      );
    }

    // Check nullifier replay for this contract
    const { data: existingNullifier } = await db
      .from('identity_nullifiers')
      .select('id')
      .eq('nullifier_hash', identity_attestation.nullifier_hash)
      .eq('contract_id', contract.id)
      .single();

    if (existingNullifier) {
      return NextResponse.json(
        { error: 'nullifier_replay', message: 'This identity proof has already been used for this contract.' },
        { status: 409 },
      );
    }

    identityResult = result.metadata ?? { provider: 'demos', verified: true };
  }

  const { data: signerRows } = await db
    .from('signatures')
    .select('signer_wallet, slot')
    .eq('contract_id', contract.id);
  const signedWallets = (signerRows ?? []).map((r) => String(r.signer_wallet).toLowerCase());

  if (signedWallets.includes(wallet_address.toLowerCase())) {
    return NextResponse.json(
      { error: 'duplicate_signature', message: 'This wallet has already signed this contract' },
      { status: 409 },
    );
  }

  // Party gate: the signing wallet must be the party it signs as, for every
  // party field a template defines (see lib/contract/signers.ts). Runs BEFORE
  // the signature is stored. Without it any wallet could sign as the
  // counterparty of a template the old two-field check did not know (C3's
  // requester/executor, C2's client, D1's delegatee) and activate a contract
  // that names someone else, and a stranger's signature on a one-sided
  // contract (P2) was stored before it was rejected.
  //
  // A slot with no declared wallet is open, and the wallet signature alone does
  // not say who may fill it: the creator's key vouches for the principal side
  // and the invite token for the counterparty side. Looked up only for a slot
  // that is open, so a contract with declared wallets signs keyless as before.
  const parties = resolveSignerParties(contract);
  const open = openSlots(parties);
  const placed = placedOf(signerRows);
  let auth: SignAuth = { creator: false, invite: false };
  let inviteBlockedByKey = false;
  if (open.length > 0) {
    // Look up only what this wallet could use: the creator check when it could
    // take the open principal slot (a declared counterparty never triggers it),
    // the token when one was sent for an open counterparty slot.
    const asCreator = canSignAs(parties, signedWallets, wallet_address, { creator: true, invite: false }, placed);
    const couldTakePrincipal = open.includes('principal') && asCreator.ok && asCreator.slot === 'principal';
    try {
      let invite =
        open.includes('counterparty') &&
        typeof share_token === 'string' &&
        (await isInviteToken(contract.id, share_token));
      const holdsCreatingKey =
        (couldTakePrincipal || invite) && contract.api_key_id
          ? (await validateApiKey(request))?.keyId === contract.api_key_id
          : false;
      // The creator is never placed on the counterparty side through an invite:
      // a creating key that cannot prove the creator would otherwise fall
      // through to it with a token that was meant for someone else.
      if (invite && holdsCreatingKey) {
        invite = false;
        inviteBlockedByKey = true;
      }
      auth = {
        creator: couldTakePrincipal && (await requestIsCreator(contract, wallet_address, holdsCreatingKey)),
        invite,
      };
    } catch (err) {
      console.error(`[sign] party check failed for ${contract.contract_id}:`, err);
      return NextResponse.json(
        {
          error: 'party_check_unavailable',
          message: 'Could not check who may sign for this contract right now. Nothing was stored. Try again shortly.',
        },
        { status: 503 },
      );
    }
  }
  const gate = canSignAs(parties, signedWallets, wallet_address, auth, placed);
  if (!gate.ok) {
    if (parties.oneSided) {
      return NextResponse.json(
        {
          error: 'not_principal',
          message:
            'One-sided contracts (Power of Attorney) can only be signed by the principal wallet declared at deploy time.',
        },
        { status: 403 },
      );
    }
    if (inviteBlockedByKey && gate.restricted?.includes('counterparty')) {
      return NextResponse.json(
        {
          error: 'principal_slot_restricted',
          message:
            'This request carries the API key that created the contract, so it is treated as the creator and cannot sign the counterparty side with an invite. ' +
            'Sign the principal side with the creating account\'s verified wallet, or sign as the counterparty from a session that does not hold the creator\'s key.',
        },
        { status: 403 },
      );
    }
    if (gate.restricted?.includes('principal')) {
      return NextResponse.json(
        {
          error: 'principal_slot_restricted',
          message:
            'No wallet is named for the principal side of this contract, so only its creator can sign for it. ' +
            'If the creating account has a verified wallet (the wallet that paid for its key or for one of its contracts), sign with that wallet; an API key alone is not enough then. ' +
            'Otherwise send the creating API key (X-API-Key header) with this request. A contract paid for with x402 is signed by the wallet that paid.' +
            (gate.restricted.includes('counterparty')
              ? ' If you were invited as the counterparty, sign from the invite link the contract owner sent you.'
              : ''),
        },
        { status: 403 },
      );
    }
    if (gate.restricted?.includes('counterparty')) {
      return NextResponse.json(
        {
          error: 'counterparty_invite_required',
          message:
            'The counterparty side of this contract is open and is filled by invitation only. ' +
            'Open the invite link the contract owner sent you (a getamber.dev/reader link with a token) and sign from there, ' +
            'or send that token as share_token. Ask the owner for a new link if you have none.',
        },
        { status: 403 },
      );
    }
    if (gate.open.length === 1 && gate.open[0] === 'counterparty') {
      return NextResponse.json(
        {
          error: 'unauthorized_counterparty',
          message:
            'This wallet cannot countersign this contract. If a counterparty wallet was declared, only that wallet can countersign; otherwise this wallet is already the other party or has not been allowed to take the counterparty slot.',
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      {
        error: 'unauthorized_party',
        message:
          'This wallet is not a party to this contract, or the party it would sign as has already signed. Sign with the wallet declared in the contract.',
      },
      { status: 403 },
    );
  }

  const { error: sigError } = await db.from('signatures').insert({
    contract_id: contract.id,
    signer_wallet: wallet_address.toLowerCase(),
    signature,
    message_hash: contract.sha256_hash,
    // A bare wallet ECDSA signature binds no identity: 'simple'. Only a
    // verified ZK identity attestation (require_zk_identity) earns 'advanced'.
    // Set explicitly; the column default is 'advanced'.
    signature_level: identityResult ? 'advanced' : 'simple',
    // The side this signature fills. Unique per contract (signatures_contract_slot_uniq),
    // so two requests that both passed the gate for one open slot cannot both land.
    slot: gate.slot,
    ...(identityResult ? { signer_identity: identityResult } : {}),
  });

  if (sigError) {
    const e = sigError as { code?: string; message?: string; details?: string };
    if (e.code === '23505' && `${e.message ?? ''} ${e.details ?? ''}`.includes('signatures_contract_slot_uniq')) {
      return NextResponse.json(
        {
          error: 'slot_taken',
          message: 'Another signature has just filled this side of the contract. Check who has signed and try again.',
        },
        { status: 409 },
      );
    }
    // The unique index on (contract_id, lower(signer_wallet)) catches two
    // requests from one wallet that both passed the check above.
    if (e.code === '23505') {
      return NextResponse.json(
        { error: 'already_signed', message: 'This wallet has already signed this contract' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: 'storage_failed', message: 'Failed to store signature' },
      { status: 500 },
    );
  }

  // Record nullifier to prevent replay
  if (contract.require_zk_identity && identity_attestation) {
    await db.from('identity_nullifiers').insert({
      nullifier_hash: identity_attestation.nullifier_hash,
      wallet_address: wallet_address.toLowerCase(),
      contract_id: contract.id,
      provider: identity_attestation.provider || 'demos',
      merkle_root: identity_attestation.merkle_root,
    });
  }

  // Status follows from who has signed, not from the previous status alone:
  // the contract is in force only when no required slot is missing. The
  // database allows one step at a time (draft -> pending_signature ->
  // active for a two-sided contract, see signing-transitions.ts), and each step
  // is conditional on the status this request last saw, so racing requests
  // cannot both move the row. A missed update re-reads status and signatures
  // (the winner may have added its own) and tries again, a few times at most.
  const readComplete = async () => {
    const { data: rows } = await db
      .from('signatures')
      .select('signer_wallet, slot')
      .eq('contract_id', contract.id);
    // Slot-aware: a row that records its slot fills that slot only, so two
    // signatures for the counterparty side can never complete the contract.
    return (
      missingSlots(parties, (rows ?? []).map((r) => String(r.signer_wallet)), placedOf(rows)).length === 0
    );
  };

  let newStatus: string = contract.status;
  let movedToPending = false;
  let movedToActive = false;
  let complete = await readComplete();
  let rechecked = false;

  for (let attempt = 0; attempt < 4; attempt++) {
    const next = nextSigningStatus(newStatus, parties.oneSided, complete);
    if (next === newStatus) {
      // Nothing to do on an incomplete set: look once more, because the other
      // party's request may have committed its signature since we last read.
      if (!complete && !rechecked) {
        rechecked = true;
        complete = await readComplete();
        if (complete) continue;
      }
      break;
    }

    if (next === 'active' && !parties.oneSided) {
      // Check visibility agreement before activating (a one-sided contract has
      // no counterparty to disagree with).
      const { data: acceptHandshakes } = await db
        .from('handshakes')
        .select('wallet_address, visibility_preference')
        .eq('contract_id', contract.id)
        .eq('intent', 'accept')
        .not('visibility_preference', 'is', null);

      const contractVisibility = contract.visibility || 'private';
      const mismatch = (acceptHandshakes ?? []).find(
        (h) => h.visibility_preference !== contractVisibility,
      );

      if (mismatch) {
        return NextResponse.json(
          {
            error: 'visibility_mismatch',
            message: `Cannot activate: visibility mismatch. Contract is '${contractVisibility}' but ${mismatch.wallet_address} prefers '${mismatch.visibility_preference}'. Resolve via handshake before signing.`,
          },
          { status: 409 },
        );
      }
    }

    const { data: moved, error: statusErr } = await db
      .from('contracts')
      .update({ status: next })
      .eq('id', contract.id)
      .eq('status', newStatus)
      .select('id');
    // Silent .update() failures (e.g. the enforce_status_transition trigger
    // rejecting a jump) used to slip through here: the local status stayed at
    // 'active', the mint fired anyway, but the DB row's status stayed at
    // 'draft' (amb-2026-0032). Now we surface the error so the caller knows the
    // transition failed BEFORE the mint runs.
    if (statusErr) {
      console.error(`[sign] status update failed for ${contract.contract_id}: ${statusErr.message}`);
      return NextResponse.json(
        {
          error: 'status_update_failed',
          message: `Could not transition contract from ${newStatus} to ${next}: ${statusErr.message}`,
          old_status: newStatus,
          attempted_status: next,
        },
        { status: 500 },
      );
    }

    if ((moved ?? []).length > 0) {
      newStatus = next;
      if (next === 'pending_signature') movedToPending = true;
      if (next === 'active') movedToActive = true;
      continue;
    }

    // Another request moved it first: start again from what is stored.
    const { data: current } = await db.from('contracts').select('status').eq('id', contract.id).single();
    newStatus = (current?.status as string | undefined) ?? newStatus;
    complete = await readComplete();
  }
  const transitioned = movedToPending || movedToActive;

  let nftMintTriggered = false;
  if (movedToActive) {
    // Only the request whose update moved the row into active mints.
    // Synchronous mint. Previously fire-and-forget which got killed by
    // Vercel's function teardown after the HTTP response, leaving
    // nft_mint_status='pending' permanently (see amb-2026-0027). Now awaits
    // the Base mainnet mint within the 120s maxDuration we exported at top.
    // If the mint fails, we still record the signature and return a 201 —
    // operator can use /api/v1/admin/cnft-retry to retry the mint later.
    try {
      await mintContractNFTAsync(contract.id);
    } catch (err) {
      console.error('cNFT mint failed (sync path):', err);
    }
    nftMintTriggered = true;
  }

  await db.from('audit_log').insert({
    contract_id: contract.id,
    action: 'signed',
    actor: wallet_address.toLowerCase(),
    details: {
      signature_prefix: signature.slice(0, 20),
      // Secondary record; signatures.slot is the source of truth.
      slot: gate.slot,
      new_status: newStatus,
      transitioned,
      ...(identityResult ? { zk_identity_verified: true, provider: 'demos' } : {}),
    },
  });

  // ──────────────────────────────────────────────────────────────────────
  // Transactional email pipeline (fire-and-await but never throws —
  // notifyContract handles its own errors). Three events:
  //   1. share_invite (handled in share/route.ts, not here)
  //   2. counterparty_signed — fires on draft|handshake → pending_signature
  //   3. contract_activated — fires on pending_signature → active (both sides)
  //
  // Sender detection: we treat the api-key owner (contracts.api_key_id →
  // api_keys.email) as the sender. If this signature's wallet matches
  // contracts.principal_wallet we assume the sender signed; otherwise the
  // counterparty signed.
  // ──────────────────────────────────────────────────────────────────────
  try {
    const isSenderSigning =
      contract.principal_wallet
        ? contract.principal_wallet.toLowerCase() === wallet_address.toLowerCase()
        : false;

    // Persist counterparty email on the contract if this signer is the
    // counterparty AND they provided an email. Always overrides prior value
    // (last-write-wins: the counterparty's own email beats what the sender
    // pre-filled at share time).
    const normalisedSignerEmail =
      typeof signer_email === 'string'
        ? signer_email.trim().toLowerCase()
        : null;
    const validSignerEmail =
      normalisedSignerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalisedSignerEmail)
        ? normalisedSignerEmail
        : null;

    if (validSignerEmail && !isSenderSigning) {
      await db
        .from('contracts')
        .update({ counterparty_email: validSignerEmail })
        .eq('id', contract.id);
    }

    // Lookup sender's email (api_key owner) for any sender-facing email
    let senderEmail: string | null = null;
    if (contract.api_key_id) {
      const { data: keyRow } = await db
        .from('api_keys')
        .select('email')
        .eq('id', contract.api_key_id)
        .single();
      senderEmail = keyRow?.email ?? null;
    }

    const nowISO = new Date().toISOString();

    // Event 2: counterparty signed → notify sender (only when SOMEONE OTHER
    // than the sender just signed AND status transitioned to pending_signature).
    if (
      movedToPending
      && !isSenderSigning
      && senderEmail
    ) {
      // Generate a dashboard-facing contract URL for the sender to click
      const contractUrl = `https://getamber.dev/dashboard?contract=${contract.contract_id}`;
      await notifyContract({
        event: 'counterparty_signed',
        contractId: contract.id,
        contractIdLabel: contract.contract_id,
        contractHash: contract.sha256_hash,
        recipientEmail: senderEmail,
        recipientRole: 'sender',
        contractUrl,
        signerWalletShort: wallet_address.slice(0, 8),
        signedAtISO: nowISO,
      });
    }

    // Event 3: contract activated → notify BOTH parties (only on
    // pending_signature → active transition).
    if (movedToActive && !parties.oneSided) {
      // The reader URL works for both sides as long as they have the share
      // token. We don't have the token here, so use the dashboard URL for
      // the sender and reader-by-hash (which requires a token but the email
      // body explains the activation status either way).
      const senderUrl = `https://getamber.dev/dashboard?contract=${contract.contract_id}`;
      // The counterparty link carries a read-only token so it opens the reader
      // instead of the wallet gate. Purpose 'deployer' views the contract and
      // signs nothing (lib/contract/share-token.ts); never 'invite', which would
      // let its holder take a party slot. Same 30-day expiry as the deploy link.
      // On any failure the email goes out with the tokenless link.
      let counterpartyUrl = `https://getamber.dev/reader/${contract.sha256_hash}`;
      try {
        const readToken = randomBytes(32).toString('hex');
        const { error: readTokenError } = await db.from('share_tokens').insert({
          contract_id: contract.id,
          token: readToken,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          purpose: 'deployer',
        });
        if (!readTokenError) counterpartyUrl += `?token=${readToken}`;
      } catch {
        // Keep the tokenless link.
      }

      if (senderEmail) {
        await notifyContract({
          event: 'contract_activated',
          contractId: contract.id,
          contractIdLabel: contract.contract_id,
          contractHash: contract.sha256_hash,
          recipientEmail: senderEmail,
          recipientRole: 'sender',
          readerUrl: senderUrl,
          activatedAtISO: nowISO,
        });
      }

      // Counterparty email: prefer the value we just stored (if any),
      // otherwise the existing contracts.counterparty_email.
      const finalCounterpartyEmail = validSignerEmail && !isSenderSigning
        ? validSignerEmail
        : contract.counterparty_email;
      if (finalCounterpartyEmail) {
        await notifyContract({
          event: 'contract_activated',
          contractId: contract.id,
          contractIdLabel: contract.contract_id,
          contractHash: contract.sha256_hash,
          recipientEmail: finalCounterpartyEmail,
          recipientRole: 'counterparty',
          readerUrl: counterpartyUrl,
          activatedAtISO: nowISO,
        });
      }
    }
  } catch (emailErr) {
    // Email pipeline failures never break the signature response.
    console.error('contract notification dispatch error:', emailErr);
  }

  return NextResponse.json({
    contract_id: contract.contract_id,
    signer: wallet_address.toLowerCase(),
    status: newStatus,
    message: `Contract signed successfully${transitioned ? `. Status: ${contract.status} → ${newStatus}` : ''}`,
    ...(identityResult ? { zk_identity: { verified: true, provider: 'demos' } } : {}),
    ...(nftMintTriggered && {
      nft_mint_status: 'pending',
      nft_metadata_url: getMetadataUri(contract.sha256_hash),
    }),
  });
}

export { corsOptions as OPTIONS };
