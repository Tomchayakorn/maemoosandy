-- "น้องเหมียว 9 ชีวิต": admin tool to give a player their daily chance back (reset TODAY's play).
--   * The daily limit is one row in public.cat_game_plays per user per Bangkok date (0016, UNIQUE (user_id, play_date)).
--     Resetting = deleting TODAY's row for that user, so they can play once more today (9 coins + a new reward, as usual).
--   * It never touches wallets or wallet_ledger: the coins and the -9 / +prize ledger rows of the earlier play stay exactly as they were.
--   * Every reset is logged in public.cat_game_admin_resets (who, which user, what the removed play was, why) BEFORE the row is deleted.
--   * Only service_role can run it (called from the admin-only API route after the admin is verified). Resetting twice in a row is
--     refused (NOTHING_TO_RESET) because there is no play left to remove.
-- Run once in the Supabase SQL editor AFTER 0016. Safe to run again.

create table if not exists public.cat_game_admin_resets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  play_date         date not null,
  removed_play_id   uuid,
  removed_cat_index smallint,
  removed_reward    integer,
  reset_by          text not null,
  reason            text,
  created_at        timestamptz not null default now()
);
create index if not exists cat_game_admin_resets_user_idx on public.cat_game_admin_resets (user_id, created_at desc);

-- no policy at all: nobody except service_role can read or write it
alter table public.cat_game_admin_resets enable row level security;
revoke all on public.cat_game_admin_resets from anon, authenticated;

create or replace function public.admin_reset_cat_game(
  p_user_id uuid,
  p_admin   text,
  p_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets%rowtype;
  v_today  date := public.bangkok_today();
  v_play   public.cat_game_plays%rowtype;
begin
  if p_admin is null or char_length(p_admin) = 0 or char_length(p_admin) > 200
     or (p_reason is not null and char_length(p_reason) > 200) then
    raise exception 'INVALID_AMOUNT';
  end if;

  -- same lock order as play_cat_game (wallet row first), so a reset can never interleave with a play in progress
  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  select * into v_play from public.cat_game_plays where user_id = p_user_id and play_date = v_today;
  if not found then raise exception 'NOTHING_TO_RESET'; end if;

  insert into public.cat_game_admin_resets
    (user_id, play_date, removed_play_id, removed_cat_index, removed_reward, reset_by, reason)
  values
    (p_user_id, v_today, v_play.id, v_play.cat_index, v_play.reward_coins, p_admin, nullif(btrim(p_reason), ''));

  delete from public.cat_game_plays where id = v_play.id;

  return jsonb_build_object(
    'play_date', v_today,
    'removed_reward', v_play.reward_coins,
    'balance', v_wallet.balance
  );
end;
$$;

revoke all on function public.admin_reset_cat_game(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_reset_cat_game(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
