-- "เปิดหีบมนตรา" (Mystic Chests): pick a bet and 1-3 cursed chests among 9, open chests one by one, each safe chest raises the
-- multiplier, cash out any time after the first safe chest. A cursed chest ends the round (bet lost).
--   * mystic_chest_rounds: one row per round. The cursed positions (mine_mask) live ONLY here and nobody but service_role can read the table
--     (RLS on, no policy), so a player can never see them before the round ends; the API shows them only for a finished round.
--     A partial unique index allows ONE active round per user.
--   * Coins move ONLY in these functions, always under the wallet row lock, with wallet_ledger rows of their own reasons:
--       'mystic_bet'  (-bet)    when a round starts
--       'mystic_win'  (+payout) when the round pays out (cash out, all safe chests opened, or the cap reached)
--     Nothing is written to `transactions` or `withdrawal_requests`, so the daily income/expense summary is never touched.
--   * Multiplier after k safe chests with m cursed = floor((10000 - 1000 house edge) * prod(9-i)/(9-m-i)) basis points. The table below is
--     pinned to src/lib/mystic/config.ts by a unit test. Payout = min(floor(bet * multiplier / 10000), 5000).
--   * The route draws the cursed positions with crypto and passes the mask; the database validates and applies it.
-- Run once in the Supabase SQL editor (after 0019). Safe to run again.

alter table public.wallet_ledger drop constraint if exists wallet_ledger_reason_check;
alter table public.wallet_ledger add constraint wallet_ledger_reason_check
  check (reason in ('tarot', 'birthdate', 'topup', 'spin', 'checkin', 'refund', 'admin',
                    'withdrawal', 'withdrawal_refund', 'luckycard', 'luckycard_bonus', 'catgame', 'catgame_prize', 'voucher',
                    'mystic_bet', 'mystic_win'));

create table if not exists public.mystic_chest_rounds (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  bet         integer not null check (bet in (10, 20, 50, 100)),
  mines       smallint not null check (mines between 1 and 3),
  mine_mask   smallint not null check (mine_mask between 0 and 511),
  opened_mask smallint not null default 0 check (opened_mask between 0 and 511),
  safe_count  smallint not null default 0 check (safe_count between 0 and 8),
  status      text not null default 'active' check (status in ('active', 'cashed', 'lost', 'cleared')),
  payout      integer not null default 0 check (payout >= 0),
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists mystic_chest_rounds_one_active_uidx on public.mystic_chest_rounds (user_id) where status = 'active';
create index if not exists mystic_chest_rounds_user_idx on public.mystic_chest_rounds (user_id, created_at desc);

alter table public.mystic_chest_rounds enable row level security;
revoke all on public.mystic_chest_rounds from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Game math (immutable)
-- -----------------------------------------------------------------------------
create or replace function public.mystic_max_payout()
returns integer language sql immutable set search_path = '' as $$ select 5000; $$;

create or replace function public.mystic_multiplier_bp(p_mines integer, p_k integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_mines
    when 1 then (array[10125, 11571, 13500, 16200, 20250, 27000, 40500, 81000])[p_k]
    when 2 then (array[11571, 15428, 21600, 32400, 54000, 108000, 324000])[p_k]
    when 3 then (array[13500, 21600, 37800, 75600, 189000, 756000])[p_k]
  end;
$$;

-- what a cash out pays after k safe chests: floor(bet * multiplier), capped
create or replace function public.mystic_payout(p_bet integer, p_mines integer, p_k integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  -- an impossible k has no multiplier (NULL); least() would ignore the NULL and return the cap, so pay 0 instead
  select case
           when public.mystic_multiplier_bp(p_mines, p_k) is null then 0
           else least((p_bet * public.mystic_multiplier_bp(p_mines, p_k)) / 10000, public.mystic_max_payout())
         end;
$$;

-- -----------------------------------------------------------------------------
-- mystic_start: charge the bet and create the round (one transaction)
-- -----------------------------------------------------------------------------
create or replace function public.mystic_start(p_user_id uuid, p_bet integer, p_mines integer, p_mine_mask integer)
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
  if p_mines is null or p_mines not between 1 and 3 or p_mine_mask is null or p_mine_mask not between 0 and 511
     or (select count(*) from generate_series(0, 8) g where ((p_mine_mask >> g) & 1) = 1) <> p_mines then
    raise exception 'INVALID_MINES';
  end if;

  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  if exists (select 1 from public.mystic_chest_rounds where user_id = p_user_id and status = 'active') then
    raise exception 'ACTIVE_ROUND_EXISTS';
  end if;
  if v_wallet.balance < p_bet then raise exception 'INSUFFICIENT_COINS'; end if;

  begin
    insert into public.mystic_chest_rounds (id, user_id, bet, mines, mine_mask) values (v_round, p_user_id, p_bet, p_mines, p_mine_mask);
  exception when unique_violation then
    raise exception 'ACTIVE_ROUND_EXISTS';
  end;

  update public.wallets set balance = balance - p_bet where user_id = p_user_id returning * into v_wallet;
  insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id) values (p_user_id, 'mystic_bet', -p_bet, v_round);

  return jsonb_build_object('round_id', v_round, 'status', 'active', 'bet', p_bet, 'mines', p_mines, 'opened_mask', 0,
                            'safe_count', 0, 'mine_mask', null, 'payout', 0, 'balance', v_wallet.balance, 'auto', null);
end;
$$;

-- -----------------------------------------------------------------------------
-- mystic_open: open one chest. Lock order: round row, then wallet row.
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

-- -----------------------------------------------------------------------------
-- mystic_cashout: take the coins. Pays once (a second call -> ROUND_NOT_ACTIVE).
-- -----------------------------------------------------------------------------
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

  v_pay := public.mystic_payout(v_r.bet, v_r.mines, v_r.safe_count);

  perform 1 from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  update public.wallets set balance = balance + v_pay where user_id = p_user_id returning balance into v_balance;
  insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id) values (p_user_id, 'mystic_win', v_pay, v_r.id);
  update public.mystic_chest_rounds set status = 'cashed', payout = v_pay, finished_at = now() where id = v_r.id;

  return jsonb_build_object('round_id', v_r.id, 'status', 'cashed', 'bet', v_r.bet, 'mines', v_r.mines, 'opened_mask', v_r.opened_mask,
                            'safe_count', v_r.safe_count, 'mine_mask', v_r.mine_mask, 'payout', v_pay, 'balance', v_balance, 'auto', null);
end;
$$;

revoke all on function public.mystic_max_payout() from public, anon, authenticated;
revoke all on function public.mystic_multiplier_bp(integer, integer) from public, anon, authenticated;
revoke all on function public.mystic_payout(integer, integer, integer) from public, anon, authenticated;
revoke all on function public.mystic_start(uuid, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.mystic_open(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.mystic_cashout(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mystic_max_payout() to service_role;
grant execute on function public.mystic_multiplier_bp(integer, integer) to service_role;
grant execute on function public.mystic_payout(integer, integer, integer) to service_role;
grant execute on function public.mystic_start(uuid, integer, integer, integer) to service_role;
grant execute on function public.mystic_open(uuid, uuid, integer) to service_role;
grant execute on function public.mystic_cashout(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
