-- "วงล้อไต่ชั้น" bonus multipliers (x2 / x5 / x8). Run once in the Supabase SQL editor (after 0021; safe to run again).
-- If 0021 is ever run again, run this file again afterwards (0021 replaces power_spin / power_stop with the old versions).
--
-- Rules (rounds started by power_start_bonus, bonus_version = 2):
--   * Clearing level 3 UNLOCKS the bonus: one roll 0..999 (drawn by the server with crypto) is turned into a multiplier HERE and stored on
--     the round once: 0-3 -> x8 (0.4%), 4-13 -> x5 (1%), 14-63 -> x2 (5%), 64-999 -> x1 (93.6%). Later rolls are ignored.
--   * Payout after k levels = floor(bet * table(k) * bonus / 10000), never above 3,000 (bonus = 1 below level 3).
--   * Levels 1-2 of the table are the old ones; from level 3 the old value is divided by the average bonus 1.118, so every stopping strategy
--     still returns at most 90% (house edge 10%, unchanged). A danger slice still loses the bet.
-- Rounds already running (bonus_version = 1) keep the old rules until they end. The old functions keep working:
--   power_start (version 1), power_spin and power_stop (both versions).
-- No new ledger reason: a win is still one 'power_win' row holding the whole amount, bonus included. Nothing else is touched.
-- The numbers below are pinned to src/lib/power-wheel/config.ts by a unit test.

alter table public.power_wheel_rounds add column if not exists bonus_version smallint not null default 1;
alter table public.power_wheel_rounds add column if not exists bonus_multiplier smallint;
alter table public.power_wheel_rounds drop constraint if exists power_wheel_rounds_bonus_check;
alter table public.power_wheel_rounds add constraint power_wheel_rounds_bonus_check
  check (bonus_version in (1, 2) and (bonus_multiplier is null or (bonus_version = 2 and bonus_multiplier in (1, 2, 5, 8))));

-- -----------------------------------------------------------------------------
-- Bonus math (immutable)
-- -----------------------------------------------------------------------------
create or replace function public.power_bonus_unlock_level()
returns integer language sql immutable set search_path = '' as $$ select 3; $$;

-- roll 0..999 -> multiplier; anything else -> null (refused by the caller)
create or replace function public.power_bonus_for_roll(p_roll integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
           when p_roll is null or p_roll < 0 or p_roll > 999 then null
           when p_roll < 4 then 8
           when p_roll < 14 then 5
           when p_roll < 64 then 2
           else 1
         end;
$$;

-- multiplier after clearing k levels in a bonus round (before the bonus), basis points
create or replace function public.power_multiplier_bp_bonus(p_k integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (array[10000, 11111, 12422, 15528, 22183, 31691, 52818, 88031, 176062, 352125, 880313, 2200782])[p_k];
$$;

-- what a bonus round pays after clearing k levels with multiplier p_bonus (null = not unlocked = 1), capped at 3,000
create or replace function public.power_payout_bonus(p_bet integer, p_k integer, p_bonus integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
           when public.power_multiplier_bp_bonus(p_k) is null then 0
           else least((p_bet::bigint * public.power_multiplier_bp_bonus(p_k) * coalesce(p_bonus, 1)) / 10000, public.power_max_payout())::integer
         end;
$$;

-- -----------------------------------------------------------------------------
-- power_start_bonus: exactly power_start (same checks, same charge) and mark the new round as a bonus round, in one transaction
-- -----------------------------------------------------------------------------
create or replace function public.power_start_bonus(p_user_id uuid, p_bet integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  v := public.power_start(p_user_id, p_bet);
  update public.power_wheel_rounds set bonus_version = 2 where id = (v ->> 'round_id')::uuid;
  return v || jsonb_build_object('bonus_version', 2, 'bonus', null, 'unlocked', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- power_spin_bonus: spin once; unlocks the bonus when level 3 is cleared. Lock order: round row, then wallet row.
-- -----------------------------------------------------------------------------
create or replace function public.power_spin_bonus(p_user_id uuid, p_round_id uuid, p_slice integer, p_roll integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r        public.power_wheel_rounds%rowtype;
  v_k        integer;
  v_bonus    integer;
  v_unlocked boolean := false;
  v_raw      bigint;
  v_pay      integer;
  v_auto     text := null;
  v_status   text := 'active';
  v_balance  integer;
begin
  if p_slice is null or p_slice not between 0 and 9 then raise exception 'INVALID_SLICE'; end if;
  if public.power_bonus_for_roll(p_roll) is null then raise exception 'INVALID_REWARD'; end if;

  select * into v_r from public.power_wheel_rounds where id = p_round_id and user_id = p_user_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if v_r.status <> 'active' then raise exception 'ROUND_NOT_ACTIVE'; end if;

  -- a round started under the old rules finishes under the old rules
  if v_r.bonus_version = 1 then
    return public.power_spin(p_user_id, p_round_id, p_slice)
      || jsonb_build_object('bonus_version', 1, 'bonus', null, 'unlocked', false);
  end if;

  v_k := v_r.level + 1;
  v_bonus := v_r.bonus_multiplier;

  if public.power_slice_is_danger(v_k, p_slice) then
    update public.power_wheel_rounds set status = 'lost', payout = 0, finished_at = now() where id = v_r.id;
    select balance into v_balance from public.wallets where user_id = p_user_id;
    return jsonb_build_object('round_id', v_r.id, 'status', 'lost', 'bet', v_r.bet, 'level', v_r.level, 'payout', 0,
                              'balance', v_balance, 'auto', null, 'slice', p_slice, 'failed', true,
                              'bonus_version', 2, 'bonus', v_bonus, 'unlocked', false);
  end if;

  if v_bonus is null and v_k >= public.power_bonus_unlock_level() then
    v_bonus := public.power_bonus_for_roll(p_roll);
    v_unlocked := true;
  end if;

  v_raw := (v_r.bet::bigint * public.power_multiplier_bp_bonus(v_k) * coalesce(v_bonus, 1)) / 10000;
  v_pay := public.power_payout_bonus(v_r.bet, v_k, v_bonus);

  if v_k = public.power_max_level() then v_auto := 'top';
  elsif v_raw >= public.power_max_payout() then v_auto := 'cap';
  end if;

  if v_auto is not null then
    v_status := 'cleared';
    perform 1 from public.wallets where user_id = p_user_id for update;
    if not found then raise exception 'WALLET_NOT_FOUND'; end if;
    update public.wallets set balance = balance + v_pay where user_id = p_user_id returning balance into v_balance;
    insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id) values (p_user_id, 'power_win', v_pay, v_r.id);
  else
    select balance into v_balance from public.wallets where user_id = p_user_id;
  end if;

  update public.power_wheel_rounds
     set level = v_k, payout = v_pay, bonus_multiplier = v_bonus, status = v_status,
         finished_at = case when v_status = 'active' then null else now() end
   where id = v_r.id;

  return jsonb_build_object('round_id', v_r.id, 'status', v_status, 'bet', v_r.bet, 'level', v_k, 'payout', v_pay,
                            'balance', v_balance, 'auto', v_auto, 'slice', p_slice, 'failed', false,
                            'bonus_version', 2, 'bonus', v_bonus, 'unlocked', v_unlocked);
end;
$$;

-- -----------------------------------------------------------------------------
-- The old functions, now aware of the version. power_spin keeps its signature: version 1 is byte-for-byte the 0021 behaviour; a bonus round
-- reaching it (e.g. an older website build) is handed to power_spin_bonus with a roll made here, so no round can get stuck.
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

  if v_r.bonus_version = 2 then
    return public.power_spin_bonus(p_user_id, p_round_id, p_slice,
      ((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000)::integer);
  end if;

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

  v_pay := case when v_r.bonus_version = 2
                then public.power_payout_bonus(v_r.bet, v_r.level, v_r.bonus_multiplier)
                else public.power_payout(v_r.bet, v_r.level) end;

  perform 1 from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  update public.wallets set balance = balance + v_pay where user_id = p_user_id returning balance into v_balance;
  insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id) values (p_user_id, 'power_win', v_pay, v_r.id);
  update public.power_wheel_rounds set status = 'cashed', payout = v_pay, finished_at = now() where id = v_r.id;

  return jsonb_build_object('round_id', v_r.id, 'status', 'cashed', 'bet', v_r.bet, 'level', v_r.level, 'payout', v_pay,
                            'balance', v_balance, 'auto', null, 'slice', null, 'failed', false,
                            'bonus_version', v_r.bonus_version, 'bonus', v_r.bonus_multiplier, 'unlocked', false);
end;
$$;

revoke all on function public.power_bonus_unlock_level() from public, anon, authenticated;
revoke all on function public.power_bonus_for_roll(integer) from public, anon, authenticated;
revoke all on function public.power_multiplier_bp_bonus(integer) from public, anon, authenticated;
revoke all on function public.power_payout_bonus(integer, integer, integer) from public, anon, authenticated;
revoke all on function public.power_start_bonus(uuid, integer) from public, anon, authenticated;
revoke all on function public.power_spin_bonus(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.power_spin(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.power_stop(uuid, uuid) from public, anon, authenticated;
grant execute on function public.power_bonus_unlock_level() to service_role;
grant execute on function public.power_bonus_for_roll(integer) to service_role;
grant execute on function public.power_multiplier_bp_bonus(integer) to service_role;
grant execute on function public.power_payout_bonus(integer, integer, integer) to service_role;
grant execute on function public.power_start_bonus(uuid, integer) to service_role;
grant execute on function public.power_spin_bonus(uuid, uuid, integer, integer) to service_role;
grant execute on function public.power_spin(uuid, uuid, integer) to service_role;
grant execute on function public.power_stop(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
