-- "จับคู่ภาพเหมือน" (matching pairs): 12 face-down cards (6 pairs), 20 coins a round, 12 turns (a turn = 2 cards), 5 coins per pair found and
-- 15 more for clearing the board (45 at most), 3 rounds per Bangkok calendar day.
--   * match_game_rounds: one row per round, RLS on and NO policy (only service_role reads/writes) — the card layout must never reach a browser.
--     A partial unique index allows ONE active round per user.
--   * Coins move ONLY in these functions, under the wallet row lock, with wallet_ledger rows of their own reasons:
--       'match_bet' (-20) when a round starts · 'match_win' (+5) for each pair, paid at once · 'match_bonus' (+15) with the sixth pair.
--     Nothing touches `transactions` or `withdrawal_requests`, so the daily income/expense summary is untouched.
--   * Double taps: a second start is refused (ACTIVE_ROUND_EXISTS); every flip names the step it expects (STALE_ROUND_STATE otherwise),
--     so a repeated request can never be applied twice.
--   * The route shuffles the layout with crypto; the database only accepts a layout holding each of the 6 symbols exactly twice.
-- The constants below are pinned to src/lib/match-game/config.ts by a unit test.
-- Run once in the Supabase SQL editor (after 0021). Safe to run again.

alter table public.wallet_ledger drop constraint if exists wallet_ledger_reason_check;
alter table public.wallet_ledger add constraint wallet_ledger_reason_check
  check (reason in ('tarot', 'birthdate', 'topup', 'spin', 'checkin', 'refund', 'admin',
                    'withdrawal', 'withdrawal_refund', 'luckycard', 'luckycard_bonus', 'catgame', 'catgame_prize', 'voucher',
                    'mystic_bet', 'mystic_win', 'power_bet', 'power_win', 'match_bet', 'match_win', 'match_bonus'));

create table if not exists public.match_game_rounds (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  play_date   date not null default public.bangkok_today(),
  layout      smallint[] not null check (array_length(layout, 1) = 12),
  matched     integer not null default 0 check (matched between 0 and 4095),
  first_pick  smallint check (first_pick between 0 and 11),
  turns_used  smallint not null default 0 check (turns_used between 0 and 12),
  pairs       smallint not null default 0 check (pairs between 0 and 6),
  payout      integer not null default 0 check (payout between 0 and 45),
  status      text not null default 'active' check (status in ('active', 'finished')),
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists match_game_rounds_one_active_uidx on public.match_game_rounds (user_id) where status = 'active';
create index if not exists match_game_rounds_user_day_idx on public.match_game_rounds (user_id, play_date);

alter table public.match_game_rounds enable row level security;
revoke all on public.match_game_rounds from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Constants
-- -----------------------------------------------------------------------------
create or replace function public.match_cost()         returns integer language sql immutable set search_path = '' as $$ select 20; $$;
create or replace function public.match_max_turns()    returns integer language sql immutable set search_path = '' as $$ select 12; $$;
create or replace function public.match_pair_reward()  returns integer language sql immutable set search_path = '' as $$ select 5; $$;
create or replace function public.match_clear_bonus()  returns integer language sql immutable set search_path = '' as $$ select 15; $$;
create or replace function public.match_daily_rounds() returns integer language sql immutable set search_path = '' as $$ select 3; $$;

-- -----------------------------------------------------------------------------
-- What a player may see of a round: found pairs and the open card; the whole layout only once the round is over.
-- -----------------------------------------------------------------------------
create or replace function public.match_view(p_round_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'round_id', r.id,
    'status', r.status,
    'turns_used', r.turns_used,
    'pairs', r.pairs,
    'payout', r.payout,
    'step', r.turns_used * 2 + (case when r.first_pick is null then 0 else 1 end),
    'matched', coalesce((
        select jsonb_agg(jsonb_build_object('position', g.i, 'symbol', r.layout[g.i + 1]) order by g.i)
        from generate_series(0, 11) as g(i)
        where (r.matched & (1 << g.i)) <> 0), '[]'::jsonb),
    'open', case when r.first_pick is null then null
                 else jsonb_build_object('position', r.first_pick, 'symbol', r.layout[r.first_pick + 1]) end,
    'layout', case when r.status = 'finished' then to_jsonb(r.layout) else null end,
    'balance', (select w.balance from public.wallets w where w.user_id = r.user_id),
    'rounds_today', (select count(*) from public.match_game_rounds d where d.user_id = r.user_id and d.play_date = public.bangkok_today())
  )
  from public.match_game_rounds r
  where r.id = p_round_id;
$$;

-- -----------------------------------------------------------------------------
-- match_start: check the daily limit, charge the round and store the shuffled layout (one transaction)
-- -----------------------------------------------------------------------------
create or replace function public.match_start(p_user_id uuid, p_layout integer[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets%rowtype;
  v_round  uuid := gen_random_uuid();
begin
  if p_layout is null or array_length(p_layout, 1) is distinct from 12
     or (select count(*) from (
           select u.s from unnest(p_layout) as u(s) where u.s between 0 and 5 group by u.s having count(*) = 2) t) <> 6 then
    raise exception 'INVALID_LAYOUT';
  end if;

  -- the wallet row lock serialises every start of this user (double tap, 2 tabs, 2 devices)
  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  if exists (select 1 from public.match_game_rounds where user_id = p_user_id and status = 'active') then
    raise exception 'ACTIVE_ROUND_EXISTS';
  end if;
  if (select count(*) from public.match_game_rounds where user_id = p_user_id and play_date = public.bangkok_today()) >= public.match_daily_rounds() then
    raise exception 'DAILY_LIMIT_REACHED';
  end if;
  if v_wallet.balance < public.match_cost() then raise exception 'INSUFFICIENT_COINS'; end if;

  begin
    insert into public.match_game_rounds (id, user_id, layout) values (v_round, p_user_id, p_layout::smallint[]);
  exception when unique_violation then
    raise exception 'ACTIVE_ROUND_EXISTS';
  end;

  update public.wallets set balance = balance - public.match_cost() where user_id = p_user_id;
  insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id) values (p_user_id, 'match_bet', -public.match_cost(), v_round);

  return public.match_view(v_round);
end;
$$;

-- -----------------------------------------------------------------------------
-- match_flip: turn one card. The second card of a turn settles it and pays at once. Lock order: round row, then wallet row.
-- -----------------------------------------------------------------------------
create or replace function public.match_flip(p_user_id uuid, p_round_id uuid, p_position integer, p_step integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r       public.match_game_rounds%rowtype;
  v_symbol  integer;
  v_first   integer;
  v_match   boolean;
  v_matched integer;
  v_pairs   integer;
  v_turns   integer;
  v_pair    integer := 0;
  v_bonus   integer := 0;
  v_done    boolean;
begin
  select * into v_r from public.match_game_rounds where id = p_round_id and user_id = p_user_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if v_r.status <> 'active' then raise exception 'ROUND_NOT_ACTIVE'; end if;
  if p_position is null or p_position not between 0 and 11 then raise exception 'INVALID_CARD'; end if;
  if p_step is distinct from (v_r.turns_used * 2 + (case when v_r.first_pick is null then 0 else 1 end)) then
    raise exception 'STALE_ROUND_STATE';
  end if;
  if (v_r.matched & (1 << p_position)) <> 0 then raise exception 'CARD_ALREADY_MATCHED'; end if;
  if v_r.first_pick is not null and v_r.first_pick = p_position then raise exception 'CARD_ALREADY_OPEN'; end if;

  v_symbol := v_r.layout[p_position + 1];

  if v_r.first_pick is null then
    update public.match_game_rounds set first_pick = p_position where id = v_r.id;
    return public.match_view(v_r.id)
      || jsonb_build_object('flip', jsonb_build_object('position', p_position, 'symbol', v_symbol, 'second', false));
  end if;

  v_first   := v_r.first_pick;
  v_match   := v_r.layout[v_first + 1] = v_symbol;
  v_turns   := v_r.turns_used + 1;
  v_matched := v_r.matched;
  v_pairs   := v_r.pairs;
  if v_match then
    v_matched := v_matched | (1 << v_first) | (1 << p_position);
    v_pairs := v_pairs + 1;
    v_pair := public.match_pair_reward();
    if v_pairs = 6 then v_bonus := public.match_clear_bonus(); end if;
  end if;
  v_done := v_pairs = 6 or v_turns >= public.match_max_turns();

  if v_pair > 0 then
    perform 1 from public.wallets where user_id = p_user_id for update;
    if not found then raise exception 'WALLET_NOT_FOUND'; end if;
    update public.wallets set balance = balance + v_pair + v_bonus where user_id = p_user_id;
    insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id) values (p_user_id, 'match_win', v_pair, v_r.id);
    if v_bonus > 0 then
      insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id) values (p_user_id, 'match_bonus', v_bonus, v_r.id);
    end if;
  end if;

  update public.match_game_rounds
     set first_pick = null, turns_used = v_turns, matched = v_matched, pairs = v_pairs, payout = payout + v_pair + v_bonus,
         status = case when v_done then 'finished' else 'active' end,
         finished_at = case when v_done then now() else null end
   where id = v_r.id;

  return public.match_view(v_r.id) || jsonb_build_object('flip', jsonb_build_object(
    'position', p_position, 'symbol', v_symbol, 'second', true,
    'first_position', v_first, 'first_symbol', v_r.layout[v_first + 1],
    'match', v_match, 'pair_reward', v_pair, 'bonus', v_bonus));
end;
$$;

revoke all on function public.match_cost() from public, anon, authenticated;
revoke all on function public.match_max_turns() from public, anon, authenticated;
revoke all on function public.match_pair_reward() from public, anon, authenticated;
revoke all on function public.match_clear_bonus() from public, anon, authenticated;
revoke all on function public.match_daily_rounds() from public, anon, authenticated;
revoke all on function public.match_view(uuid) from public, anon, authenticated;
revoke all on function public.match_start(uuid, integer[]) from public, anon, authenticated;
revoke all on function public.match_flip(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.match_cost() to service_role;
grant execute on function public.match_max_turns() to service_role;
grant execute on function public.match_pair_reward() to service_role;
grant execute on function public.match_clear_bonus() to service_role;
grant execute on function public.match_daily_rounds() to service_role;
grant execute on function public.match_view(uuid) to service_role;
grant execute on function public.match_start(uuid, integer[]) to service_role;
grant execute on function public.match_flip(uuid, uuid, integer, integer) to service_role;

notify pgrst, 'reload schema';
