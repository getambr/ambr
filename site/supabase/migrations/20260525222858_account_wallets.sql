-- Migration: account_wallets binding table
-- Purpose: explicit "these wallets belong to this account" mapping so the
-- dashboard can show wallet-centric views and the wallet model is no longer
-- inferred via fuzzy joins across contracts/signatures/api_keys.
--
-- Context (2026-05-25): all session, the lack of this binding caused
-- repeated wallet-attribution flips between team members' wallets,
-- and meant the dashboard could only filter contracts by api_key, not by
-- any of the user's wallets.
--
-- Wallet → account is many-to-many in principle: the same wallet could be
-- bound to multiple accounts (a shared dev wallet, or a wallet a user has
-- registered under two different emails). PK is (api_key_id, wallet_address).

create table if not exists account_wallets (
  api_key_id   uuid not null references api_keys(id) on delete cascade,
  wallet_address text not null,  -- always stored lowercase
  bound_at     timestamptz not null default now(),
  -- How this binding was discovered. 'manual' = user explicitly added via
  -- Account settings; the three 'auto_*' values are populated by upsert
  -- hooks on the respective endpoints.
  source       text not null check (source in (
    'auto_deploy',         -- contracts POST captured this wallet as principal_wallet
    'auto_signature',      -- contracts/[id]/sign was called with this wallet from a logged-in session
    'auto_wallet_auth',    -- dashboard/wallet-auth handshake bound the wallet
    'auto_backfill',       -- inserted by the backfill block below (historical data)
    'manual'               -- user clicked "+ add wallet" in account settings
  )),
  primary key (api_key_id, wallet_address)
);

-- Forward index: "what wallets does this account own?"
-- (PK already covers (api_key_id, wallet_address) so we get this lookup free.)

-- Reverse index: "which account(s) own this wallet?" — used for fast lookups
-- in the dashboard query when joining wallet-match contracts back to the user.
create index if not exists account_wallets_wallet_address_idx
  on account_wallets (wallet_address);

-- Enable RLS — only server-side reads via service role for now. No public
-- expose; clients fetch their own bindings via /api/v1/account/wallets which
-- runs server-side. (Consistent with the May 20 RLS lockdown of internal
-- tables — see 20260520000000_enable_rls_server_only_tables.sql.)
alter table account_wallets enable row level security;
-- No policies created → service-role-only access, anon key blocked.

-- ─────────────────────────────────────────────────────────────────────────
-- BACKFILL: populate from existing data so the dashboard immediately shows
-- the right contracts after this migration runs.
--
-- Source 1: contracts where api_key_id + principal_wallet are both set.
-- These were captured by the f820153 commit on May 18 onward; any contract
-- created before then won't have principal_wallet populated, so this catches
-- the new chat-deploy era.
insert into account_wallets (api_key_id, wallet_address, source)
select distinct
  c.api_key_id,
  lower(c.principal_wallet),
  'auto_backfill'
from contracts c
where c.api_key_id is not null
  and c.principal_wallet is not null
  and c.principal_wallet ~ '^0x[a-fA-F0-9]{40}$'
on conflict (api_key_id, wallet_address) do nothing;

-- Source 2: signatures table joined to contract.api_key_id. If a user signed
-- a contract from a logged-in session, the signer_wallet belongs to them.
-- Note: this is wider than source 1 — catches counterparties too if they
-- happened to sign from an api_key session.
insert into account_wallets (api_key_id, wallet_address, source)
select distinct
  c.api_key_id,
  lower(s.signer_wallet),
  'auto_backfill'
from signatures s
join contracts c on c.id = s.contract_id
where c.api_key_id is not null
  and s.signer_wallet is not null
  and s.signer_wallet ~ '^0x[a-fA-F0-9]{40}$'
on conflict (api_key_id, wallet_address) do nothing;

-- Source 3: api_keys.tx_from — wallet that paid for the api_key via x402.
-- Rarely populated but authoritative when present.
insert into account_wallets (api_key_id, wallet_address, source)
select
  id,
  lower(tx_from),
  'auto_backfill'
from api_keys
where tx_from is not null
  and tx_from ~ '^0x[a-fA-F0-9]{40}$'
on conflict (api_key_id, wallet_address) do nothing;
