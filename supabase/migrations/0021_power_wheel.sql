-- "วงล้อไต่ชั้น" (Power Wheel Climb): a NEW game, separate from the lucky wheel. Pick a bet (10/20/50/100), spin a 10-slice wheel to
-- climb level by level (12 levels). On level k some slices are danger slices; a danger slice ends the round (bet lost), a safe slice
-- climbs to the next level and raises the multiplier. The player may stop and take the coins after clearing at least one level.
--   * power_wheel_rounds: one row per round, RLS on and NO policy (only service_role reads/writes). A partial unique index allows ONE active round per user.
--   * Coins move ONLY in these functions, always under the wallet row lock, with wallet_ledger rows of their own reasons:
--       'power_bet' (-bet)    when a round starts
--       'power_win' (+payout) when the round pays out (stop, top level cleared, or the cap reached)
--     Prizes go to the coin wallet only: nothing touches jackpot withdrawals, the lucky-wheel counters, `transactions` or
--     `withdrawal_requests`, so the daily income/expense summary and the old wheel are untouched. No free ticket is used.
--   * Multiplier after clearing k levels = floor(9000 * 10^k / prod(10 - danger_i)) basis points (house edge 10%, every stopping strategy
--     returns ~90%). Payout = min(floor(bet * multiplier / 10000), 3000). The tables below are pinned to src/lib/power-wheel/config.ts by a unit test.
--   * The route draws ONLY the slice (0..9) with crypto; whether it is a danger slice is decided here from the level, so a caller can't pick the outcome.
-- Run once in the Supabase SQL editor (after 0020). Safe to run again.

alter table public.wallet_ledger drop constraint if exists wallet_ledger_reason_check;
alter table public.wallet_ledger add constraint wallet_ledger_reason_check
  check (reason in ('tarot', 'birthdate', 'topup', 'spin', 'checkin', 'refund', 'admin',
                    'withdrawal', 'withdrawal_refund', 'luckycard', 'luckycard_bonus', 'catgame', 'catgame_prize', 'voucher',
                    'mystic_bet', 'mystic_win', 'power_bet', 'power_win'));

create table if not exists public.power_wheel_rounds (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  bet         integer not null check (bet in (10, 20, 50, 100)),
  level       smallint not null default 0 check (level between 0 and 12),
  status      text not null default 'active' check (status in ('active', 'cashed', 'lost', 'cleared')),
  payout      integer not null default 0 check (payout >= 0),
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists power_wheel_rounds_one_active_uidx on public.power_wheel_rounds (user_id) where status = 'active';
create index if not exists power_wheel_rounds_user_idx on public.power_wheel_rounds (user_id, created_at desc);

alter table public.power_wheel_rounds enable row level security;
revoke all on public.power_wheel_rounds from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Game math (immutable)
-- -----------------------------------------------------------------------------
create or replace function public.power_max_payout()
returns integer language sql immutable set search_path = '' as $$ select 3000; $$;

create or replace function public.power_max_level()
returns integer language sql immutable set search_path = '' as $$ select 12; $$;

-- danger slices on level k (of 10)
create or replace function public.power_danger_count(p_level integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (array[1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6])[p_level];
$$;

-- multiplier after clearing k levels, basis points
create or replace function public.power_multiplier_bp(p_k integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (array[10000, 11111, 13888, 17361, 24801, 35430, 59051, 98418, 196837, 393675, 984189, 2460474])[p_k];
$$;

-- is this slice a danger slice on this level? the first power_danger_count(level) entries of the order are dangerous
create or replace function public.power_slice_is_danger(p_level integer, p_slice integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (array_position(array[0, 5, 2, 7, 4, 9, 1, 6, 3, 8], p_slice) - 1) < public.power_danger_count(p_level),
    false);
$$;

-- what stopping after clearing k levels pays: floor(bet * multiplier), capped at 3,000. An impossible k pays 0 (least() would ignore the NULL).
create or replace function public.power_payout(p_bet integer, p_k integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
           when public.power_multiplier_bp(p_k) is null then 0
           else least((p_bet * public.power_multiplier_bp(p_k)) / 10000, public.power_max_payout())
         end;
$$;

-- -----------------------------------------------------------------------------
-- power_start: charge the bet and create the round (one transaction)
-- -----------------------------------------------------------------------------
create or replace function public.power_start(p_user_id uuid, p_bet integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets%rowtype;
  v_round  uuid := gen_random_uuid();
begin
  if p_bet is null or p_bet not in (10, 20, 50, 100) then raise exception 'INVALID_BET'; end if;

  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  if exists (select 1 from public.power_wheel_rounds where user_id = p_user_id and status = 'active') then
    raise exception 'ACTIVE_ROUND_EXISTS';
  end if;
  if v_wallet.balance < p_bet then raise exception 'INSUFFICIENT_COINS'; end if;

  begin
    insert into public.power_wheel_rounds (id, user_id, bet) values (v_round, p_user_id, p_bet);
  exception when unique_violation then
    raise exception 'ACTIVE_ROUND_EXISTS';
  end;

  update public.wallets set balance = balance - p_bet where user_id = p_user_id returning * into v_wallet;
  insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id) values (p_user_id, 'power_bet', -p_bet, v_round);

  return jsonb_build_object('round_id', v_round, 'status', 'active', 'bet', p_bet, 'level', 0, 'payout', 0,
                            'balance', v_wallet.balance, 'auto', null, 'slice', null, 'failed', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- power_spin: spin once on the next level. Lock order: round row, then wallet row.
-- -----------------------------------------------------------------------------
create or replace function public.power_spin(p_user_id uuid, p_round_id uuid, p_slice integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r       public.power_wheel_rounds%rowtype;
  v_k       integer;
  v_raw     integer;
  v_pay     integer;
  v_auto    text := null;
  v_balance integer;
begin
  if p_slice is null or p_slice not between 0 and 9 then raise exception 'INVALID_SLICE'; end if;

  select * into v_r from public.power_wheel_rounds where id = p_round_id and user_id = p_user_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if v_r.status <> 'active' then raise exception 'ROUND_NOT_ACTIVE'; end if;

  v_k := v_r.level + 1;

  -- a danger slice: the round is lost, no payout
  if public.power_slice_is_danger(v_k, p_slice) then
    update public.power_wheel_rounds set status = 'lost', payout = 0, finished_at = now() where id = v_r.id;
    select balance into v_balance from public.wallets where user_id = p_user_id;
    return jsonb_build_object('round_id', v_r.id, 'status', 'lost', 'bet', v_r.bet, 'level', v_r.level, 'payout', 0,
                              'balance', v_balance, 'auto', null, 'slice', p_slice, 'failed', true);
  end if;

  v_raw := (v_r.bet * public.power_multiplier_bp(v_k)) / 10000;
  v_pay := least(v_raw, public.power_max_payout());

  if v_k = public.power_max_level() then v_auto := 'top';
  elsif v_raw >= public.power_max_payout() then v_auto := 'cap';
  end if;

  if v_auto is not null then
    perform 1 from public.wallets where user_id = p_user_id for update;
    update public.wallets set balance = balance + v_pay where user_id = p_user_id returning balance into v_balance;
    insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id) values (p_user_id, 'power_win', v_pay, v_r.id);
    update public.power_wheel_rounds set level = v_k, status = 'cleared', payout = v_pay, finished_at = now() where id = v_r.id;
    return jsonb_build_object('round_id', v_r.id, 'status', 'cleared', 'bet', v_r.bet, 'level', v_k, 'payout', v_pay,
                              'balance', v_balance, 'auto', v_auto, 'slice', p_slice, 'failed', false);
  end if;

  update public.power_wheel_rounds set level = v_k, payout = v_pay where id = v_r.id;
  select balance into v_balance from public.wallets where user_id = p_user_id;
  return jsonb_build_object('round_id', v_r.id, 'status', 'active', 'bet', v_r.bet, 'level', v_k, 'payout', v_pay,
                            'balance', v_balance, 'auto', null, 'slice', p_slice, 'failed', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- power_stop: take the coins. Pays once (a second call -> ROUND_NOT_ACTIVE).
-- -----------------------------------------------------------------------------
create or replace function public.power_stop(p_user_id uuid, p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r       public.power_wheel_rounds%rowtype;
  v_pay     integer;
  v_balance integer;
begin
  select * into v_r from public.power_wheel_rounds where id = p_round_id and user_id = p_user_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if v_r.status <> 'active' then raise exception 'ROUND_NOT_ACTIVE'; end if;
  if v_r.level < 1 then raise exception 'NO_LEVEL_CLEARED'; end if;

  v_pay := public.power_payout(v_r.bet, v_r.level);

  perform 1 from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  update public.wallets set balance = balance + v_pay where user_id = p_user_id returning balance into v_balance;
  insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id) values (p_user_id, 'power_win', v_pay, v_r.id);
  update public.power_wheel_rounds set status = 'cashed', payout = v_pay, finished_at = now() where id = v_r.id;

  return jsonb_build_object('round_id', v_r.id, 'status', 'cashed', 'bet', v_r.bet, 'level', v_r.level, 'payout', v_pay,
                            'balance', v_balance, 'auto', null, 'slice', null, 'failed', false);
end;
$$;

revoke all on function public.power_max_payout() from public, anon, authenticated;
revoke all on function public.power_max_level() from public, anon, authenticated;
revoke all on function public.power_danger_count(integer) from public, anon, authenticated;
revoke all on function public.power_multiplier_bp(integer) from public, anon, authenticated;
revoke all on function public.power_slice_is_danger(integer, integer) from public, anon, authenticated;
revoke all on function public.power_payout(integer, integer) from public, anon, authenticated;
revoke all on function public.power_start(uuid, integer) from public, anon, authenticated;
revoke all on function public.power_spin(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.power_stop(uuid, uuid) from public, anon, authenticated;
grant execute on function public.power_max_payout() to service_role;
grant execute on function public.power_max_level() to service_role;
grant execute on function public.power_danger_count(integer) to service_role;
grant execute on function public.power_multiplier_bp(integer) to service_role;
grant execute on function public.power_slice_is_danger(integer, integer) to service_role;
grant execute on function public.power_payout(integer, integer) to service_role;
grant execute on function public.power_start(uuid, integer) to service_role;
grant execute on function public.power_spin(uuid, uuid, integer) to service_role;
grant execute on function public.power_stop(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
