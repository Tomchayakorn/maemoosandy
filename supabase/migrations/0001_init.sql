-- =============================================================================
-- แม่มูแซนดี้ ทำนายดวงชะตา บ้าน ณ มัณตรา — initial schema
--
-- Security model
--   * Every table has RLS enabled. Clients (anon / authenticated) can only
--     SELECT their own rows. The only client write is profiles.display_name /
--     avatar_url.
--   * Coins and tickets change ONLY through the SECURITY DEFINER functions
--     below, which are executable by `service_role` only (called from Next.js
--     API routes after the user is verified). Clients cannot call them.
--   * Every balance change writes a row to wallet_ledger (audit + one-time refund).
--
-- Run once in Supabase Dashboard → SQL Editor (or `supabase db push`).
-- Re-running is mostly safe (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Today's date in Thailand (daily check-in resets at midnight Bangkok time).
create or replace function public.bangkok_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Bangkok')::date;
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  balance              integer not null default 0 check (balance >= 0),
  spin_tickets         integer not null default 1 check (spin_tickets >= 0),
  free_reading_tickets integer not null default 0 check (free_reading_tickets >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Top-up history (PromptPay slip / payment gateway)
create table if not exists public.transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  package_id     text not null,
  amount_thb     numeric(10, 2) not null check (amount_thb > 0),
  coins_added    integer not null default 0 check (coins_added >= 0),
  status         text not null default 'pending'
                 check (status in ('pending', 'success', 'failed', 'rejected')),
  provider       text,                 -- 'easyslip' | 'slipok' | 'omise' ...
  charge_id      text,                 -- provider charge / verification id
  slip_ref       text unique,          -- bank transaction ref; UNIQUE blocks slip reuse
  slip_path      text,                 -- path in the private `slips` bucket
  failure_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists transactions_user_created_idx
  on public.transactions (user_id, created_at desc);

-- Every coin / ticket movement. Positive = credit, negative = debit.
create table if not exists public.wallet_ledger (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references auth.users (id) on delete cascade,
  reason                     text not null
                             check (reason in ('tarot', 'birthdate', 'topup', 'spin', 'checkin', 'refund', 'admin')),
  coins_delta                integer not null default 0,
  spin_tickets_delta         integer not null default 0,
  free_reading_tickets_delta integer not null default 0,
  ref_id                     uuid,            -- transaction / spin_log / original ledger id
  refunded_at                timestamptz,     -- set once when a debit is refunded
  created_at                 timestamptz not null default now()
);
create index if not exists wallet_ledger_user_created_idx
  on public.wallet_ledger (user_id, created_at desc);

create table if not exists public.fortune_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  fortune_type     text not null check (fortune_type in ('tarot', 'birthdate')),
  question         text,
  input            jsonb not null default '{}'::jsonb,  -- cards drawn / computed astrology data
  result_text      text not null,
  coins_spent      integer not null default 0 check (coins_spent >= 0),
  used_free_ticket boolean not null default false,
  ledger_id        uuid references public.wallet_ledger (id),
  created_at       timestamptz not null default now()
);
create index if not exists fortune_logs_user_created_idx
  on public.fortune_logs (user_id, created_at desc);

create table if not exists public.spin_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  reward_key   text not null,                 -- wheel segment id, e.g. 'coins_10'
  reward_type  text not null check (reward_type in ('coins', 'free_reading', 'none')),
  reward_value integer not null default 0 check (reward_value >= 0),
  created_at   timestamptz not null default now()
);
create index if not exists spin_logs_user_created_idx
  on public.spin_logs (user_id, created_at desc);

create table if not exists public.daily_checkins (
  user_id      uuid not null references auth.users (id) on delete cascade,
  checkin_date date not null default public.bangkok_today(),
  created_at   timestamptz not null default now(),
  primary key (user_id, checkin_date)
);

-- updated_at triggers
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at before update on public.wallets
  for each row execute function public.set_updated_at();

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- New user → profile + wallet (balance 0, 1 spin ticket)
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ), 80),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill users who signed up before this migration.
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;
insert into public.wallets (user_id) select id from auth.users on conflict (user_id) do nothing;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.wallets        enable row level security;
alter table public.transactions   enable row level security;
alter table public.wallet_ledger  enable row level security;
alter table public.fortune_logs   enable row level security;
alter table public.spin_logs      enable row level security;
alter table public.daily_checkins enable row level security;

-- Read own rows only
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "wallets: read own" on public.wallets;
create policy "wallets: read own" on public.wallets
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "transactions: read own" on public.transactions;
create policy "transactions: read own" on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "wallet_ledger: read own" on public.wallet_ledger;
create policy "wallet_ledger: read own" on public.wallet_ledger
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "fortune_logs: read own" on public.fortune_logs;
create policy "fortune_logs: read own" on public.fortune_logs
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "spin_logs: read own" on public.spin_logs;
create policy "spin_logs: read own" on public.spin_logs
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "daily_checkins: read own" on public.daily_checkins;
create policy "daily_checkins: read own" on public.daily_checkins
  for select to authenticated using ((select auth.uid()) = user_id);

-- Defense in depth: strip write privileges from client roles entirely.
revoke insert, update, delete, truncate on
  public.wallets, public.transactions, public.wallet_ledger,
  public.fortune_logs, public.spin_logs, public.daily_checkins
from anon, authenticated;

revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

revoke all on public.profiles, public.wallets, public.transactions, public.wallet_ledger,
  public.fortune_logs, public.spin_logs, public.daily_checkins from anon;

-- -----------------------------------------------------------------------------
-- Coin / ticket RPCs (SECURITY DEFINER, service_role only)
-- Errors are raised with a stable code in the message, e.g. 'INSUFFICIENT_COINS'.
-- -----------------------------------------------------------------------------

-- Debit coins for a reading. Returns the ledger id (keep it for a refund).
create or replace function public.spend_coins(
  p_user_id uuid,
  p_amount  integer,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
  v_ledger  uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_reason not in ('tarot', 'birthdate') then
    raise exception 'INVALID_REASON';
  end if;

  select balance into v_balance
  from public.wallets where user_id = p_user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;
  if v_balance < p_amount then
    raise exception 'INSUFFICIENT_COINS';
  end if;

  update public.wallets
  set balance = balance - p_amount
  where user_id = p_user_id
  returning balance into v_balance;

  insert into public.wallet_ledger (user_id, reason, coins_delta)
  values (p_user_id, p_reason, -p_amount)
  returning id into v_ledger;

  return jsonb_build_object('ledger_id', v_ledger, 'balance', v_balance);
end;
$$;

-- Use one "free reading" ticket (won from the wheel) instead of coins.
create or replace function public.use_free_reading_ticket(
  p_user_id uuid,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tickets integer;
  v_ledger  uuid;
begin
  if p_reason not in ('tarot', 'birthdate') then
    raise exception 'INVALID_REASON';
  end if;

  select free_reading_tickets into v_tickets
  from public.wallets where user_id = p_user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;
  if v_tickets < 1 then
    raise exception 'NO_FREE_READING_TICKETS';
  end if;

  update public.wallets
  set free_reading_tickets = free_reading_tickets - 1
  where user_id = p_user_id
  returning free_reading_tickets into v_tickets;

  insert into public.wallet_ledger (user_id, reason, free_reading_tickets_delta)
  values (p_user_id, p_reason, -1)
  returning id into v_ledger;

  return jsonb_build_object('ledger_id', v_ledger, 'free_reading_tickets', v_tickets);
end;
$$;

-- Reverse a debit exactly once (e.g. the AI call failed). Safe to call twice.
create or replace function public.refund_coins(
  p_ledger_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.wallet_ledger%rowtype;
  v_wallet public.wallets%rowtype;
begin
  select * into v_entry
  from public.wallet_ledger where id = p_ledger_id
  for update;

  if not found then
    raise exception 'LEDGER_NOT_FOUND';
  end if;
  if v_entry.reason not in ('tarot', 'birthdate') then
    raise exception 'NOT_REFUNDABLE';
  end if;
  if v_entry.refunded_at is not null then
    return jsonb_build_object('refunded', false, 'already_refunded', true);
  end if;

  update public.wallets
  set balance              = balance - v_entry.coins_delta,
      free_reading_tickets = free_reading_tickets - v_entry.free_reading_tickets_delta
  where user_id = v_entry.user_id
  returning * into v_wallet;

  update public.wallet_ledger set refunded_at = now() where id = p_ledger_id;

  insert into public.wallet_ledger
    (user_id, reason, coins_delta, free_reading_tickets_delta, ref_id)
  values
    (v_entry.user_id, 'refund', -v_entry.coins_delta, -v_entry.free_reading_tickets_delta, p_ledger_id);

  return jsonb_build_object(
    'refunded', true,
    'balance', v_wallet.balance,
    'free_reading_tickets', v_wallet.free_reading_tickets
  );
end;
$$;

-- Credit coins for a verified top-up. Idempotent per slip_ref:
--   same user + same slip  → returns already_credited = true, no double credit
--   other user + same slip → raises SLIP_ALREADY_USED
create or replace function public.credit_topup(
  p_user_id    uuid,
  p_package_id text,
  p_amount_thb numeric,
  p_coins      integer,
  p_slip_ref   text,
  p_slip_path  text,
  p_provider   text,
  p_charge_id  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.transactions%rowtype;
  v_tx_id    uuid;
  v_balance  integer;
begin
  if p_coins is null or p_coins <= 0 or p_amount_thb is null or p_amount_thb <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_slip_ref is null or length(trim(p_slip_ref)) = 0 then
    raise exception 'MISSING_SLIP_REF';
  end if;

  -- Serialize concurrent submissions of the same slip.
  perform pg_advisory_xact_lock(hashtext('slip:' || p_slip_ref));

  select * into v_existing from public.transactions where slip_ref = p_slip_ref;
  if found then
    if v_existing.user_id = p_user_id and v_existing.status = 'success' then
      select balance into v_balance from public.wallets where user_id = p_user_id;
      return jsonb_build_object(
        'transaction_id', v_existing.id,
        'coins_added', v_existing.coins_added,
        'balance', v_balance,
        'already_credited', true
      );
    end if;
    raise exception 'SLIP_ALREADY_USED';
  end if;

  insert into public.transactions
    (user_id, package_id, amount_thb, coins_added, status, provider, charge_id, slip_ref, slip_path)
  values
    (p_user_id, p_package_id, p_amount_thb, p_coins, 'success', p_provider, p_charge_id, p_slip_ref, p_slip_path)
  returning id into v_tx_id;

  update public.wallets
  set balance = balance + p_coins
  where user_id = p_user_id
  returning balance into v_balance;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id)
  values (p_user_id, 'topup', p_coins, v_tx_id);

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'coins_added', p_coins,
    'balance', v_balance,
    'already_credited', false
  );
end;
$$;

-- Spend one spin ticket and apply the reward (picked server-side in TS with
-- weighted randomness) in a single transaction.
create or replace function public.spin_wheel(
  p_user_id      uuid,
  p_reward_key   text,
  p_reward_type  text,
  p_reward_value integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets%rowtype;
  v_spin   uuid;
begin
  if p_reward_type not in ('coins', 'free_reading', 'none') then
    raise exception 'INVALID_REWARD';
  end if;
  if p_reward_value is null or p_reward_value < 0
     or (p_reward_type = 'coins' and p_reward_value > 1000)
     or (p_reward_type = 'free_reading' and p_reward_value > 5) then
    raise exception 'INVALID_REWARD';
  end if;

  select * into v_wallet
  from public.wallets where user_id = p_user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;
  if v_wallet.spin_tickets < 1 then
    raise exception 'NO_SPIN_TICKETS';
  end if;

  update public.wallets
  set spin_tickets         = spin_tickets - 1,
      balance              = balance + case when p_reward_type = 'coins' then p_reward_value else 0 end,
      free_reading_tickets = free_reading_tickets + case when p_reward_type = 'free_reading' then p_reward_value else 0 end
  where user_id = p_user_id
  returning * into v_wallet;

  insert into public.spin_logs (user_id, reward_key, reward_type, reward_value)
  values (p_user_id, p_reward_key, p_reward_type, p_reward_value)
  returning id into v_spin;

  insert into public.wallet_ledger
    (user_id, reason, coins_delta, spin_tickets_delta, free_reading_tickets_delta, ref_id)
  values (
    p_user_id, 'spin',
    case when p_reward_type = 'coins' then p_reward_value else 0 end,
    -1,
    case when p_reward_type = 'free_reading' then p_reward_value else 0 end,
    v_spin
  );

  return jsonb_build_object(
    'spin_log_id', v_spin,
    'balance', v_wallet.balance,
    'spin_tickets', v_wallet.spin_tickets,
    'free_reading_tickets', v_wallet.free_reading_tickets
  );
end;
$$;

-- Daily check-in: +1 spin ticket, once per Bangkok calendar day.
create or replace function public.daily_checkin(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today   date := public.bangkok_today();
  v_tickets integer;
  v_rows    integer;
begin
  insert into public.daily_checkins (user_id, checkin_date)
  values (p_user_id, v_today)
  on conflict (user_id, checkin_date) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    select spin_tickets into v_tickets from public.wallets where user_id = p_user_id;
    return jsonb_build_object('granted', false, 'spin_tickets', v_tickets, 'checkin_date', v_today);
  end if;

  update public.wallets
  set spin_tickets = spin_tickets + 1
  where user_id = p_user_id
  returning spin_tickets into v_tickets;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  insert into public.wallet_ledger (user_id, reason, spin_tickets_delta)
  values (p_user_id, 'checkin', 1);

  return jsonb_build_object('granted', true, 'spin_tickets', v_tickets, 'checkin_date', v_today);
end;
$$;

-- Lock every privileged function down to service_role.
-- (Supabase grants EXECUTE on new functions to anon/authenticated by default.)
revoke all on function public.spend_coins(uuid, integer, text)                                       from public, anon, authenticated;
revoke all on function public.use_free_reading_ticket(uuid, text)                                    from public, anon, authenticated;
revoke all on function public.refund_coins(uuid)                                                     from public, anon, authenticated;
revoke all on function public.credit_topup(uuid, text, numeric, integer, text, text, text, text)     from public, anon, authenticated;
revoke all on function public.spin_wheel(uuid, text, text, integer)                                  from public, anon, authenticated;
revoke all on function public.daily_checkin(uuid)                                                    from public, anon, authenticated;
revoke all on function public.handle_new_user()                                                      from public, anon, authenticated;

grant execute on function public.spend_coins(uuid, integer, text)                                   to service_role;
grant execute on function public.use_free_reading_ticket(uuid, text)                                to service_role;
grant execute on function public.refund_coins(uuid)                                                 to service_role;
grant execute on function public.credit_topup(uuid, text, numeric, integer, text, text, text, text) to service_role;
grant execute on function public.spin_wheel(uuid, text, text, integer)                              to service_role;
grant execute on function public.daily_checkin(uuid)                                                to service_role;

-- -----------------------------------------------------------------------------
-- Realtime: let the header coin badge update live (RLS still applies).
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wallets'
     ) then
    alter publication supabase_realtime add table public.wallets;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Storage: private bucket for payment slips (uploaded by API routes only;
-- no client policies on storage.objects for this bucket).
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slips', 'slips', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
