-- Credits become cents: 1 credit = 1 US cent, and a contract burns its
-- template's price_cents. NOT applied automatically; applying it is a
-- production data change.
--
-- ORDER OF OPERATIONS: apply this migration immediately BEFORE deploying the
-- code that burns price_cents. The window between the two is a misbilling
-- window: until the new code is live, the old code still burns one credit per
-- contract, so a x20 balance would buy twenty times too many contracts; after
-- the deploy but before this migration, old balances buy twenty times too few.
-- Keep that gap as short as you can.
--
-- Re-running is a no-op: the x20 update is guarded by a marker row in
-- migration_markers, so a second run (or a replayed migration history) cannot
-- multiply balances again. The DO block says loudly which path it took.

create table if not exists public.migration_markers (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public.migration_markers enable row level security;
-- No policies: server-only table, reached through the service role.
revoke all on public.migration_markers from anon, authenticated;

-- 1 + 3. Existing balances and the Team allowance, once.
--    One old credit was one $0.20 contract, so x20. Legacy unlimited keys
--    (credits = -1) and empty keys are left alone.
--    contracts_limit predates credits; it now holds the plan's monthly credit
--    allowance (3,000 credits for the paid invoice).
do $$
declare
  v_inserted integer;
begin
  insert into public.migration_markers (name) values ('credits_in_cents_x20')
    on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.api_keys set credits = credits * 20 where credits > 0;
    update public.subscriptions set contracts_limit = 3000 where plan = 'business';
    raise notice 'credits_in_cents_x20: APPLIED (api_keys balances multiplied by 20, business contracts_limit set to 3000)';
  else
    raise warning 'credits_in_cents_x20: ALREADY APPLIED, balances and subscriptions left untouched (no-op)';
  end if;
end $$;

-- 2. No implicit grant. Every key-creation path sets credits explicitly
--    (free claim 500, packs, enterprise); the old default of 50 was a stale
--    free grant for any path that forgot to. (Idempotent.)
alter table public.api_keys alter column credits set default 0;
comment on column public.api_keys.credits is
  'Credit balance in US cents (1 credit = 1 cent). A contract burns its template price_cents. -1 = legacy unlimited.';

alter table public.subscriptions alter column contracts_limit set default 3000;
comment on column public.subscriptions.contracts_limit is
  'Monthly credit allowance in cents granted per paid invoice (Team: 3000). Name predates credits.';

-- 4. Idempotent credit grants (Stripe invoice.paid for Team, checkout.session
--    for packs). One transaction inserts the marker and adds the credits, so a
--    redelivered webhook, or two racing deliveries, grant exactly once and a
--    failed grant leaves no marker behind.
create table if not exists public.credit_grant_markers (
  marker text primary key,
  api_key_id uuid,
  amount integer not null,
  created_at timestamptz not null default now()
);
alter table public.credit_grant_markers enable row level security;
-- No policies: server-only table, reached through the service role.
revoke all on public.credit_grant_markers from anon, authenticated;

create or replace function public.grant_credits_once(
  p_marker text,
  p_api_key_id uuid,
  p_amount integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'grant_credits_once: amount must be positive';
  end if;

  perform 1 from public.api_keys where id = p_api_key_id;
  if not found then
    raise exception 'grant_credits_once: unknown api key %', p_api_key_id;
  end if;

  insert into public.credit_grant_markers (marker, api_key_id, amount)
    values (p_marker, p_api_key_id, p_amount)
    on conflict (marker) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false; -- already granted for this marker
  end if;

  -- Legacy unlimited keys (-1) stay unlimited.
  update public.api_keys
    set credits = credits + p_amount
    where id = p_api_key_id and credits <> -1;
  return true;
end;
$$;

revoke all on function public.grant_credits_once(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.grant_credits_once(text, uuid, integer) to service_role;
