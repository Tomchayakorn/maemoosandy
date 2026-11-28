-- "วงล้อไต่ชั้น" equal bonus odds: rules version 3. Run once in the Supabase SQL editor (after 0023; safe to run again).
-- If 0021 or 0023 is ever run again, run this file again afterwards (they replace the spin / stop functions with older versions).
--
-- What changes for rounds started by power_start_bonus_v3 (bonus_version = 3):
--   * Same unlock (clearing level 3, one roll 0..999 drawn by the server, mapped HERE, stored once), but x2, x5 and x8 are now EQUALLY likely:
--     0-9 -> x8, 10-19 -> x5, 20-29 -> x2 (1% each, 3% together), 30-999 -> x1 (97%).
--   * From level 3 the table is the original one divided by the new average bonus 1.12, so every stopping strategy still returns at most 90%.
-- Rounds already running keep the rules they started with: version 1 (0021) and version 2 (0023) are unchanged, and the old
-- power_start_bonus still creates version 2 rounds, so an older website build keeps showing exactly what it pays.
-- Bets, danger slices, the 3,000 cap, paying once and the ledger reasons are unchanged. Nothing else is touched.
-- The numbers below are pinned to src/lib/power-wheel/config.ts by a unit test.

alter table public.power_wheel_rounds drop constraint if exists power_wheel_rounds_bonus_check;
alter table public.power_wheel_rounds add constraint power_wheel_rounds_bonus_check
  check (bonus_version in (1, 2, 3) and (bonus_multiplier is null or (bonus_version in (2, 3) and bonus_multiplier in (1, 2, 5, 8))));

-- -----------------------------------------------------------------------------
-- Version 3 math (immutable)
-- -----------------------------------------------------------------------------
create or replace function public.power_bonus_for_roll_v3(p_roll integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
           when p_roll is null or p_roll < 0 or p_roll > 999 then null
           when p_roll < 10 then 8
           when p_roll < 20 then 5
           when p_roll < 30 then 2
           else 1
         end;
$$;

create or replace function public.power_multiplier_bp_v3(p_k integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (array[10000, 11111, 12400, 15500, 22144, 31634, 52724, 87874, 175748, 351496, 878741, 2196852])[p_k];
$$;

-- the table of a rules version
create or replace function public.power_round_bp(p_version integer, p_k integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_version
           when 3 then public.power_multiplier_bp_v3(p_k)
           when 2 then public.power_multiplier_bp_bonus(p_k)
           else public.power_multiplier_bp(p_k)
         end;
$$;

-- what a round of a version pays after k levels; the bonus only exists from version 2 (null = not unlocked = 1); capped at 3,000
create or replace function public.power_round_payout(p_bet integer, p_k integer, p_version integer, p_bonus integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
           when public.power_round_bp(p_version, p_k) is null then 0
           else least((p_bet::bigint * public.power_round_bp(p_version, p_k) * (case when p_version >= 2 then coalesce(p_bonus, 1) else 1 end)) / 10000,
                      public.power_max_payout())::integer
         end;
$$;

-- -----------------------------------------------------------------------------
-- power_start_bonus_v3: exactly power_start (same checks, same charge) and mark the new round as version 3, in one transaction
-- -----------------------------------------------------------------------------
create or replace function public.power_start_bonus_v3(p_user_id uuid, p_bet integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  v := public.power_start(p_user_id, p_bet);
  update public.power_wheel_rounds set bonus_version = 3 where id = (v ->> 'round_id')::uuid;
  return v || jsonb_build_object('bonus_version', 3, 'bonus', null, 'unlocked', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- Spin / stop, now choosing the odds and the table from the round's version (otherwise as in 0023)
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

  -- a round started under the original rules finishes under them
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
                              'bonus_version', v_r.bonus_version, 'bonus', v_bonus, 'unlocked', false);
  end if;

  if v_bonus is null and v_k >= public.power_bonus_unlock_level() then
    -- the odds of the round's own version
    v_bonus := case when v_r.bonus_version = 3 then public.power_bonus_for_roll_v3(p_roll) else public.power_bonus_for_roll(p_roll) end;
    v_unlocked := true;
  end if;

  v_raw := (v_r.bet::bigint * public.power_round_bp(v_r.bonus_version, v_k) * coalesce(v_bonus, 1)) / 10000;
  v_pay := public.power_round_payout(v_r.bet, v_k, v_r.bonus_version, v_bonus);

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
                            'bonus_version', v_r.bonus_version, 'bonus', v_bonus, 'unlocked', v_unlocked);
end;
$$;

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

  if v_r.bonus_version >= 2 then
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

  v_pay := public.power_round_payout(v_r.bet, v_r.level, v_r.bonus_version, v_r.bonus_multiplier);

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

revoke all on function public.power_bonus_for_roll_v3(integer) from public, anon, authenticated;
revoke all on function public.power_multiplier_bp_v3(integer) from public, anon, authenticated;
revoke all on function public.power_round_bp(integer, integer) from public, anon, authenticated;
revoke all on function public.power_round_payout(integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.power_start_bonus_v3(uuid, integer) from public, anon, authenticated;
revoke all on function public.power_spin_bonus(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.power_spin(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.power_stop(uuid, uuid) from public, anon, authenticated;
grant execute on function public.power_bonus_for_roll_v3(integer) to service_role;
grant execute on function public.power_multiplier_bp_v3(integer) to service_role;
grant execute on function public.power_round_bp(integer, integer) to service_role;
grant execute on function public.power_round_payout(integer, integer, integer, integer) to service_role;
grant execute on function public.power_start_bonus_v3(uuid, integer) to service_role;
grant execute on function public.power_spin_bonus(uuid, uuid, integer, integer) to service_role;
grant execute on function public.power_spin(uuid, uuid, integer) to service_role;
grant execute on function public.power_stop(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
