-- "โค้ดลับจากแม่มู" (gift vouchers for live streams).
--   * voucher_codes: one row per code = coins to give, total number of redemptions allowed (max_redemptions), expiry, on/off switch.
--     NO policy at all: players can never read the list (so codes cannot be enumerated); only service_role (admin API) touches it.
--   * voucher_redemptions: who redeemed what. UNIQUE (voucher_id, user_id) = one use per account per code, enforced by the database.
--     Players may SELECT their own rows (RLS); no client writes.
--   * wallet_ledger gets the reason 'voucher', so voucher coins are logged separately and never look like a slip top-up.
--   * redeem_voucher(user, code): locks the voucher row (then the wallet row), checks everything and credits the coins in ONE transaction,
--     so two simultaneous taps / two devices / the last remaining slot can never double-redeem or over-redeem.
--     Errors: VOUCHER_NOT_FOUND, VOUCHER_DISABLED, VOUCHER_EXPIRED, VOUCHER_ALREADY_USED, VOUCHER_FULL, WALLET_NOT_FOUND.
-- Run once in the Supabase SQL editor (after 0018; it only needs the earlier ledger constraint). Safe to run again.

alter table public.wallet_ledger drop constraint if exists wallet_ledger_reason_check;
alter table public.wallet_ledger add constraint wallet_ledger_reason_check
  check (reason in ('tarot', 'birthdate', 'topup', 'spin', 'checkin', 'refund', 'admin',
                    'withdrawal', 'withdrawal_refund', 'luckycard', 'luckycard_bonus', 'catgame', 'catgame_prize', 'voucher'));

create table if not exists public.voucher_codes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[A-Z0-9-]{4,24}$'),
  coins           integer not null check (coins between 1 and 10000),
  max_redemptions integer not null check (max_redemptions between 1 and 10000),
  redeemed_count  integer not null default 0 check (redeemed_count >= 0),
  expires_at      timestamptz not null,
  is_active       boolean not null default true,
  note            text check (note is null or char_length(note) <= 200),
  created_by      text not null,
  created_at      timestamptz not null default now(),
  check (redeemed_count <= max_redemptions)
);

create table if not exists public.voucher_redemptions (
  id          uuid primary key default gen_random_uuid(),
  voucher_id  uuid not null references public.voucher_codes (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  coins       integer not null check (coins > 0),
  created_at  timestamptz not null default now(),
  unique (voucher_id, user_id)
);
create index if not exists voucher_redemptions_user_idx on public.voucher_redemptions (user_id, created_at desc);
create index if not exists voucher_redemptions_voucher_idx on public.voucher_redemptions (voucher_id, created_at desc);

alter table public.voucher_codes enable row level security;
alter table public.voucher_redemptions enable row level security;
revoke all on public.voucher_codes from anon, authenticated;
drop policy if exists "voucher_redemptions: read own" on public.voucher_redemptions;
create policy "voucher_redemptions: read own" on public.voucher_redemptions
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete, truncate on public.voucher_redemptions from anon, authenticated;
revoke all on public.voucher_redemptions from anon;

create or replace function public.redeem_voucher(p_user_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code    text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_voucher public.voucher_codes%rowtype;
  v_redeem  uuid;
  v_balance integer;
begin
  -- lock order: voucher row, then wallet row (no other function takes the voucher lock, so there is no cycle)
  select * into v_voucher from public.voucher_codes where code = v_code for update;
  if not found then raise exception 'VOUCHER_NOT_FOUND'; end if;
  if not v_voucher.is_active then raise exception 'VOUCHER_DISABLED'; end if;
  if v_voucher.expires_at <= now() then raise exception 'VOUCHER_EXPIRED'; end if;
  -- the player's own repeat is reported as "already used" even when the code is also full
  if exists (select 1 from public.voucher_redemptions where voucher_id = v_voucher.id and user_id = p_user_id) then
    raise exception 'VOUCHER_ALREADY_USED';
  end if;
  if v_voucher.redeemed_count >= v_voucher.max_redemptions then raise exception 'VOUCHER_FULL'; end if;

  perform 1 from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  begin
    insert into public.voucher_redemptions (voucher_id, user_id, coins)
    values (v_voucher.id, p_user_id, v_voucher.coins)
    returning id into v_redeem;
  exception when unique_violation then
    raise exception 'VOUCHER_ALREADY_USED';
  end;

  update public.voucher_codes set redeemed_count = redeemed_count + 1 where id = v_voucher.id;

  update public.wallets set balance = balance + v_voucher.coins where user_id = p_user_id returning balance into v_balance;

  insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id)
  values (p_user_id, 'voucher', v_voucher.coins, v_redeem);

  return jsonb_build_object('coins', v_voucher.coins, 'balance', v_balance, 'redemption_id', v_redeem);
end;
$$;

revoke all on function public.redeem_voucher(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_voucher(uuid, text) to service_role;

notify pgrst, 'reload schema';
