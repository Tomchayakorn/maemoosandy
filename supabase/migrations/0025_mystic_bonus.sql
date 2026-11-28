-- "เปิดหีบมนตรา" bonus multipliers (x2 / x5 / x8). Run once in the Supabase SQL editor (after 0020; safe to run again).
-- If 0020 is ever run again, run this file again afterwards (0020 replaces mystic_open / mystic_cashout with the old versions).
--
-- Rules (rounds started by mystic_start_bonus, bonus_version = 2):
--   * Opening the 3rd safe chest UNLOCKS the bonus: one roll 0..999 (drawn by the server with crypto) is turned into a multiplier HERE and
--     stored on the round once: 0-9 -> x8, 10-19 -> x5, 20-29 -> x2 (1% each), 30-999 -> x1 (97%). Later rolls are ignored.
--   * Payout after k safe chests = floor(bet * table(mines, k) * bonus / 10000), never above 5,000 (bonus = 1 below the 3rd safe chest).
--   * Chests 1-2 keep the old multipliers; from the 3rd on the old value is divided by the average bonus 1.12, so every stopping strategy still
--     returns at most 90% (house edge 10%, unchanged). A cursed chest still loses the bet.
-- Rounds already running (bonus_version = 1) keep the old rules until they end. mystic_start is unchanged; mystic_open / mystic_cashout
-- handle both versions. No new ledger reason: a win is still one 'mystic_win' row holding the whole amount. The cursed positions stay
-- hidden while a round is active. Nothing else is touched.
-- The numbers below are pinned to src/lib/mystic/config.ts by a unit test.

alter table public.mystic_chest_rounds add column if not exists bonus_version smallint not null default 1;
alter table public.mystic_chest_rounds add column if not exists bonus_multiplier smallint;
alter table public.mystic_chest_rounds drop constraint if exists mystic_chest_rounds_bonus_check;
alter table public.mystic_chest_rounds add constraint mystic_chest_rounds_bonus_check
  check (bonus_version in (1, 2) and (bonus_multiplier is null or (bonus_version = 2 and bonus_multiplier in (1, 2, 5, 8))));

-- -----------------------------------------------------------------------------
-- Bonus math (immutable)
-- -----------------------------------------------------------------------------
create or replace function public.mystic_bonus_unlock_count()
returns integer language sql immutable set search_path = '' as $$ select 3; $$;

-- roll 0..999 -> multiplier; anything else -> null (refused by the caller)
create or replace function public.mystic_bonus_for_roll(p_roll integer)
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

-- multiplier after k safe chests in a bonus round (before the bonus), basis points
create or replace function public.mystic_multiplier_bp_bonus(p_mines integer, p_k integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_mines
    when 1 then (array[10125, 11571, 12053, 14464, 18080, 24107, 36160, 72321])[p_k]
    when 2 then (array[11571, 15428, 19285, 28928, 48214, 96428, 289285])[p_k]
    when 3 then (array[13500, 21600, 33750, 67500, 168750, 675000])[p_k]
  end;
$$;

-- what a round of a version pays after k safe chests; the bonus only exists in version 2 (null = not unlocked = 1); capped
create or replace function public.mystic_round_payout(p_bet integer, p_mines integer, p_k integer, p_version integer, p_bonus integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
           when p_version is distinct from 2 then public.mystic_payout(p_bet, p_mines, p_k)
           when public.mystic_multiplier_bp_bonus(p_mines, p_k) is null then 0
           else least((p_bet::bigint * public.mystic_multiplier_bp_bonus(p_mines, p_k) * coalesce(p_bonus, 1)) / 10000, public.mystic_max_payout())::integer
         end;
$$;

-- -----------------------------------------------------------------------------
-- mystic_start_bonus: exactly mystic_start (same checks, same charge) and mark the new round as a bonus round, in one transaction
-- -----------------------------------------------------------------------------
create or replace function public.mystic_start_bonus(p_user_id uuid, p_bet integer, p_mines integer, p_mine_mask integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  v := public.mystic_start(p_user_id, p_bet, p_mines, p_mine_mask);
  update public.mystic_chest_rounds set bonus_version = 2 where id = (v ->> 'round_id')::uuid;
  return v || jsonb_build_object('bonus_version', 2, 'bonus', null, 'unlocked', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- mystic_open_bonus: open one chest; unlocks the bonus on the 3rd safe chest. Lock order: round row, then wallet row.
-- -----------------------------------------------------------------------------
create or replace function public.mystic_open_bonus(p_user_id uuid, p_round_id uuid, p_tile integer, p_roll integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r        public.mystic_chest_rounds%rowtype;
  v_opened   integer;
  v_k        integer;
  v_bonus    integer;
  v_unlocked boolean := false;
  v_raw      bigint;
  v_pay      integer;
  v_auto     text := null;
  v_status   text := 'active';
  v_balance  integer;
begin
  if p_tile is null or p_tile not between 0 and 8 then raise exception 'INVALID_TILE'; end if;
  if public.mystic_bonus_for_roll(p_roll) is null then raise exception 'INVALID_REWARD'; end if;

  select * into v_r from public.mystic_chest_rounds where id = p_round_id and user_id = p_user_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if v_r.status <> 'active' then raise exception 'ROUND_NOT_ACTIVE'; end if;

  -- a round started under the old rules finishes under them
  if v_r.bonus_version = 1 then
    return public.mystic_open(p_user_id, p_round_id, p_tile)
      || jsonb_build_object('bonus_version', 1, 'bonus', null, 'unlocked', false);
  end if;

  if ((v_r.opened_mask >> p_tile) & 1) = 1 then raise exception 'TILE_ALREADY_OPENED'; end if;
  v_opened := v_r.opened_mask | (1 << p_tile);
  v_bonus := v_r.bonus_multiplier;

  -- a cursed chest: the round is lost, no payout
  if ((v_r.mine_mask >> p_tile) & 1) = 1 then
    update public.mystic_chest_rounds set opened_mask = v_opened, status = 'lost', payout = 0, finished_at = now() where id = v_r.id;
    select balance into v_balance from public.wallets where user_id = p_user_id;
    return jsonb_build_object('round_id', v_r.id, 'status', 'lost', 'bet', v_r.bet, 'mines', v_r.mines, 'opened_mask', v_opened,
                              'safe_count', v_r.safe_count, 'mine_mask', v_r.mine_mask, 'payout', 0, 'balance', v_balance, 'auto', null,
                              'bonus_version', 2, 'bonus', v_bonus, 'unlocked', false);
  end if;

  v_k := v_r.safe_count + 1;
  if v_bonus is null and v_k >= public.mystic_bonus_unlock_count() then
    v_bonus := public.mystic_bonus_for_roll(p_roll);
    v_unlocked := true;
  end if;

  v_raw := (v_r.bet::bigint * public.mystic_multiplier_bp_bonus(v_r.mines, v_k) * coalesce(v_bonus, 1)) / 10000;
  v_pay := public.mystic_round_payout(v_r.bet, v_r.mines, v_k, 2, v_bonus);

  if v_k = 9 - v_r.mines then v_auto := 'all_open';
  elsif v_raw >= public.mystic_max_payout() then v_auto := 'cap';
  end if;

  if v_auto is not null then
    v_status := 'cleared';
    perform 1 from public.wallets where user_id = p_user_id for update;
    if not found then raise exception 'WALLET_NOT_FOUND'; end if;
    update public.wallets set balance = balance + v_pay where user_id = p_user_id returning balance into v_balance;
    insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id) values (p_user_id, 'mystic_win', v_pay, v_r.id);
  else
    select balance into v_balance from public.wallets where user_id = p_user_id;
  end if;

  update public.mystic_chest_rounds
     set opened_mask = v_opened, safe_count = v_k, payout = v_pay, bonus_multiplier = v_bonus, status = v_status,
         finished_at = case when v_status = 'active' then null else now() end
   where id = v_r.id;

  -- the cursed positions stay hidden while the round is active
  return jsonb_build_object('round_id', v_r.id, 'status', v_status, 'bet', v_r.bet, 'mines', v_r.mines, 'opened_mask', v_opened,
                            'safe_count', v_k, 'mine_mask', case when v_status = 'active' then null else v_r.mine_mask end,
                            'payout', v_pay, 'balance', v_balance, 'auto', v_auto,
                            'bonus_version', 2, 'bonus', v_bonus, 'unlocked', v_unlocked);
end;
$$;

-- -----------------------------------------------------------------------------
-- The old functions, now aware of the version. mystic_open keeps its signature: version 1 is the 0020 behaviour.
-- -----------------------------------------------------------------------------
create or replace function public.mystic_open(p_user_id uuid, p_round_id uuid, p_tile integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r       public.mystic_chest_rounds%rowtype;
  v_opened  integer;
  v_k       integer;
  v_pay     integer;
  v_raw     integer;
  v_auto    text := null;
  v_balance integer;
begin
  if p_tile is null or p_tile not between 0 and 8 then raise exception 'INVALID_TILE'; end if;

  select * into v_r from public.mystic_chest_rounds where id = p_round_id and user_id = p_user_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if v_r.status <> 'active' then raise exception 'ROUND_NOT_ACTIVE'; end if;

  -- a bonus round reaching this function (e.g. an older website build) is handed to mystic_open_bonus with a roll made here
  if v_r.bonus_version = 2 then
    return public.mystic_open_bonus(p_user_id, p_round_id, p_tile,
      ((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000)::integer);
  end if;
  if ((v_r.opened_mask >> p_tile) & 1) = 1 then raise exception 'TILE_ALREADY_OPENED'; end if;

  v_opened := v_r.opened_mask | (1 << p_tile);

  -- a cursed chest: the round is lost, no payout
  if ((v_r.mine_mask >> p_tile) & 1) = 1 then
    update public.mystic_chest_rounds set opened_mask = v_opened, status = 'lost', payout = 0, finished_at = now() where id = v_r.id;
    select balance into v_balance from public.wallets where user_id = p_user_id;
    return jsonb_build_object('round_id', v_r.id, 'status', 'lost', 'bet', v_r.bet, 'mines', v_r.mines, 'opened_mask', v_opened,
                              'safe_count', v_r.safe_count, 'mine_mask', v_r.mine_mask, 'payout', 0, 'balance', v_balance, 'auto', null);
  end if;

  v_k := v_r.safe_count + 1;
  v_raw := (v_r.bet * public.mystic_multiplier_bp(v_r.mines, v_k)) / 10000;
  v_pay := least(v_raw, public.mystic_max_payout());

  if v_k = 9 - v_r.mines then v_auto := 'all_open';
  elsif v_raw >= public.mystic_max_payout() then v_auto := 'cap';
  end if;

  if v_auto is not null then
    perform 1 from public.wallets where user_id = p_user_id for update;
    update public.wallets set balance = balance + v_pay where user_id = p_user_id returning balance into v_balance;
    insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id) values (p_user_id, 'mystic_win', v_pay, v_r.id);
    update public.mystic_chest_rounds set opened_mask = v_opened, safe_count = v_k, status = 'cleared', payout = v_pay, finished_at = now() where id = v_r.id;
    return jsonb_build_object('round_id', v_r.id, 'status', 'cleared', 'bet', v_r.bet, 'mines', v_r.mines, 'opened_mask', v_opened,
                              'safe_count', v_k, 'mine_mask', v_r.mine_mask, 'payout', v_pay, 'balance', v_balance, 'auto', v_auto);
  end if;

  update public.mystic_chest_rounds set opened_mask = v_opened, safe_count = v_k, payout = v_pay where id = v_r.id;
  select balance into v_balance from public.wallets where user_id = p_user_id;
  -- the cursed positions stay hidden while the round is active
  return jsonb_build_object('round_id', v_r.id, 'status', 'active', 'bet', v_r.bet, 'mines', v_r.mines, 'opened_mask', v_opened,
                            'safe_count', v_k, 'mine_mask', null, 'payout', v_pay, 'balance', v_balance, 'auto', null);
end;
$$;

create or replace function public.mystic_cashout(p_user_id uuid, p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r       public.mystic_chest_rounds%rowtype;
  v_pay     integer;
  v_balance integer;
begin
  select * into v_r from public.mystic_chest_rounds where id = p_round_id and user_id = p_user_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if v_r.status <> 'active' then raise exception 'ROUND_NOT_ACTIVE'; end if;
  if v_r.safe_count < 1 then raise exception 'NO_SAFE_TILE'; end if;

  v_pay := public.mystic_round_payout(v_r.bet, v_r.mines, v_r.safe_count, v_r.bonus_version, v_r.bonus_multiplier);

  perform 1 from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  update public.wallets set balance = balance + v_pay where user_id = p_user_id returning balance into v_balance;
  insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id) values (p_user_id, 'mystic_win', v_pay, v_r.id);
  update public.mystic_chest_rounds set status = 'cashed', payout = v_pay, finished_at = now() where id = v_r.id;

  return jsonb_build_object('round_id', v_r.id, 'status', 'cashed', 'bet', v_r.bet, 'mines', v_r.mines, 'opened_mask', v_r.opened_mask,
                            'safe_count', v_r.safe_count, 'mine_mask', v_r.mine_mask, 'payout', v_pay, 'balance', v_balance, 'auto', null,
                            'bonus_version', v_r.bonus_version, 'bonus', v_r.bonus_multiplier, 'unlocked', false);
end;
$$;

revoke all on function public.mystic_bonus_unlock_count() from public, anon, authenticated;
revoke all on function public.mystic_bonus_for_roll(integer) from public, anon, authenticated;
revoke all on function public.mystic_multiplier_bp_bonus(integer, integer) from public, anon, authenticated;
revoke all on function public.mystic_round_payout(integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.mystic_start_bonus(uuid, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.mystic_open_bonus(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.mystic_open(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.mystic_cashout(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mystic_bonus_unlock_count() to service_role;
grant execute on function public.mystic_bonus_for_roll(integer) to service_role;
grant execute on function public.mystic_multiplier_bp_bonus(integer, integer) to service_role;
grant execute on function public.mystic_round_payout(integer, integer, integer, integer, integer) to service_role;
grant execute on function public.mystic_start_bonus(uuid, integer, integer, integer) to service_role;
grant execute on function public.mystic_open_bonus(uuid, uuid, integer, integer) to service_role;
grant execute on function public.mystic_open(uuid, uuid, integer) to service_role;
grant execute on function public.mystic_cashout(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
