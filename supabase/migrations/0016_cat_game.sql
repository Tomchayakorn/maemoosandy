-- "น้องเหมียว 9 ชีวิต": pick 1 of 9 cats once per day for 9 coins and win 200 / 300 / 400 / 500 / 1,000 coins (all credited to the wallet).
--   * public.cat_game_plays: one row per user per Bangkok calendar day (UNIQUE (user_id, play_date)) = the daily limit lives in the database.
--   * play_cat_game: locks the wallet, refuses a second play on the same Bangkok day (ALREADY_PLAYED_TODAY), needs >= 9 coins,
--     charges 9, credits the reward and logs the play + two ledger rows in ONE transaction. The route draws the reward (crypto);
--     the database only accepts the whitelisted values 200/300/400/500/1000 and cost 9.
--   * Clients can only SELECT their own plays; all writes go through this service_role-only function.
-- Run once in the Supabase SQL editor (after 0015). Safe to run again. Until it is installed /api/cat-game/play answers 503.

alter table public.wallet_ledger drop constraint if exists wallet_ledger_reason_check;
alter table public.wallet_ledger add constraint wallet_ledger_reason_check
  check (reason in ('tarot', 'birthdate', 'topup', 'spin', 'checkin', 'refund', 'admin',
                    'withdrawal', 'withdrawal_refund', 'luckycard', 'luckycard_bonus', 'catgame', 'catgame_prize'));

create table if not exists public.cat_game_plays (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  play_date     date not null,
  cat_index     smallint not null check (cat_index between 0 and 8),
  reward_coins  integer not null check (reward_coins in (200, 300, 400, 500, 1000)),
  created_at    timestamptz not null default now(),
  unique (user_id, play_date)
);

alter table public.cat_game_plays enable row level security;
drop policy if exists "cat_game_plays: read own" on public.cat_game_plays;
create policy "cat_game_plays: read own" on public.cat_game_plays
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete, truncate on public.cat_game_plays from anon, authenticated;
revoke all on public.cat_game_plays from anon;

create or replace function public.play_cat_game(
  p_user_id    uuid,
  p_cost       integer,
  p_cat_index  integer,
  p_reward     integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets%rowtype;
  v_play   uuid := gen_random_uuid();
  v_today  date := public.bangkok_today();
begin
  if p_cost <> 9 then raise exception 'INVALID_COST'; end if;
  if p_cat_index not between 0 and 8 then raise exception 'INVALID_CARD'; end if;
  if p_reward not in (200, 300, 400, 500, 1000) then raise exception 'INVALID_REWARD'; end if;

  -- the wallet row lock serialises every request of this user (double click, 2 tabs, 2 devices)
  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  if exists (select 1 from public.cat_game_plays where user_id = p_user_id and play_date = v_today) then
    raise exception 'ALREADY_PLAYED_TODAY';
  end if;
  if v_wallet.balance < p_cost then raise exception 'INSUFFICIENT_COINS'; end if;

  begin
    insert into public.cat_game_plays (id, user_id, play_date, cat_index, reward_coins)
    values (v_play, p_user_id, v_today, p_cat_index, p_reward);
  exception when unique_violation then
    raise exception 'ALREADY_PLAYED_TODAY';
  end;

  update public.wallets
  set balance = balance - p_cost + p_reward
  where user_id = p_user_id
  returning * into v_wallet;

  insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id)
  values (p_user_id, 'catgame', -p_cost, v_play);
  insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id)
  values (p_user_id, 'catgame_prize', p_reward, v_play);

  return jsonb_build_object(
    'play_id', v_play,
    'balance', v_wallet.balance,
    'reward_coins', p_reward,
    'play_date', v_today
  );
end;
$$;

revoke all on function public.play_cat_game(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.play_cat_game(uuid, integer, integer, integer) to service_role;

notify pgrst, 'reload schema';
