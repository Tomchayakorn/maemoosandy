-- "ดวงดี มีเฮ": bonus guarantee ("pity"). After N consecutive rounds with NO bonus and NO secret prize, the next round is
-- a guaranteed bonus. The streak is counted per player in wallets.lucky_card_dry_rounds and the guarantee is applied INSIDE
-- play_lucky_card under the wallet row lock, so two parallel requests can never both trigger it.
--   * message result            -> dry_rounds + 1
--   * any bonus / secret result -> dry_rounds = 0   (natural or guaranteed)
--   * dry_rounds >= p_pity_after and the drawn result is 'message' -> replaced by a bonus of p_pity_bonus coins
-- The Next.js route still draws the natural result (crypto) and passes N and the bonus size; the database only applies them.
-- Run once in the Supabase SQL editor AFTER 0007. If it is not installed yet the route falls back to the old behaviour (no guarantee).

-- Counter + one-time backfill from past plays (guarded: re-running never overwrites a live counter)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallets' and column_name = 'lucky_card_dry_rounds'
  ) then
    alter table public.wallets add column lucky_card_dry_rounds integer not null default 0
      check (lucky_card_dry_rounds >= 0);
    -- plays since the player's last bonus/secret (or all plays if they never won one)
    update public.wallets w
    set lucky_card_dry_rounds = coalesce((
      select count(*) from public.lucky_card_plays p
      where p.user_id = w.user_id
        and p.created_at > coalesce(
          (select max(x.created_at) from public.lucky_card_plays x where x.user_id = w.user_id and x.result_kind <> 'message'),
          '-infinity'::timestamptz)
    ), 0);
  end if;
end $$;

-- replace the 7-argument version (0006/0007) with one that has the guarantee parameters (defaults keep old callers working)
drop function if exists public.play_lucky_card(uuid, integer, integer, text, text, integer, integer);

create or replace function public.play_lucky_card(
  p_user_id     uuid,
  p_cost        integer,
  p_card_index  integer,
  p_kind        text,
  p_message_id  text,
  p_bonus_coins integer,
  p_prize_thb   integer,
  p_pity_after  integer default 0,   -- 0 = guarantee disabled
  p_pity_bonus  integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet     public.wallets%rowtype;
  v_play       uuid := gen_random_uuid();
  v_prize      uuid;
  v_kind       text := p_kind;
  v_message    text := p_message_id;
  v_bonus      integer := 0;
  v_guaranteed boolean := false;
begin
  if p_cost <> 20 then raise exception 'INVALID_COST'; end if;
  if p_card_index not between 0 and 7 then raise exception 'INVALID_CARD'; end if;
  if p_kind not in ('message', 'bonus', 'secret') then raise exception 'INVALID_OUTCOME'; end if;
  if p_kind = 'bonus' then
    if p_bonus_coins not in (100, 300, 500) then raise exception 'INVALID_OUTCOME'; end if;
    v_bonus := p_bonus_coins;
  end if;
  if p_kind = 'secret' and (p_prize_thb is null or p_prize_thb <= 0 or p_prize_thb > 100000) then
    raise exception 'INVALID_OUTCOME';
  end if;
  if p_pity_after < 0 or p_pity_after > 1000 then raise exception 'INVALID_OUTCOME'; end if;

  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if v_wallet.balance < p_cost then raise exception 'INSUFFICIENT_COINS'; end if;

  -- the guarantee: N dry rounds in a row and this draw is again a plain message -> make it a bonus
  if p_pity_after > 0 and v_kind = 'message' and v_wallet.lucky_card_dry_rounds >= p_pity_after then
    if p_pity_bonus not in (100, 300, 500) then raise exception 'INVALID_OUTCOME'; end if;
    v_kind := 'bonus';
    v_bonus := p_pity_bonus;
    v_message := null;
    v_guaranteed := true;
  end if;

  insert into public.lucky_card_plays (id, user_id, card_index, result_kind, message_id, bonus_coins)
  values (v_play, p_user_id, p_card_index, v_kind, v_message, v_bonus);

  update public.wallets
  set balance = balance - p_cost + v_bonus,
      lucky_card_bonus_total = lucky_card_bonus_total + v_bonus,
      lucky_card_dry_rounds = case when v_kind = 'message' then lucky_card_dry_rounds + 1 else 0 end
  where user_id = p_user_id returning * into v_wallet;

  insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id)
  values (p_user_id, 'luckycard', -p_cost, v_play);
  if v_bonus > 0 then
    insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id)
    values (p_user_id, 'luckycard_bonus', v_bonus, v_play);
  end if;

  if v_kind = 'secret' then
    insert into public.lucky_card_prizes (user_id, play_id, amount_thb)
    values (p_user_id, v_play, p_prize_thb) returning id into v_prize;
    update public.lucky_card_plays set prize_id = v_prize where id = v_play;
  end if;

  return jsonb_build_object(
    'play_id', v_play,
    'balance', v_wallet.balance,
    'prize_id', v_prize,
    'bonus_total', v_wallet.lucky_card_bonus_total,
    'kind', v_kind,
    'bonus_coins', v_bonus,
    'message_id', v_message,
    'guaranteed', v_guaranteed,
    'dry_rounds', v_wallet.lucky_card_dry_rounds
  );
end;
$$;

revoke all on function public.play_lucky_card(uuid, integer, integer, text, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.play_lucky_card(uuid, integer, integer, text, text, integer, integer, integer, integer) to service_role;

notify pgrst, 'reload schema';
