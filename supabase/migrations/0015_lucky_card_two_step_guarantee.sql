-- "ดวงดี มีเฮ": two-step guarantee (replaces the single 50-round guarantee of 0008).
--   step 1: every 10th round in a row WITHOUT any bonus/secret -> guaranteed 15-coin bonus   (wallets.lucky_card_dry_rounds)
--   step 2: every 25th round overall (continuous count, natural wins do not reset it) -> guaranteed 40-coin bonus
--                                                                                       (wallets.lucky_card_cycle_rounds)
--   Only a round that would otherwise be a plain message is upgraded; step 2 wins when both are due. A bonus/secret
--   (natural or guaranteed) resets the dry streak. The numbers come from the route (p_g1_*, p_g2_*); the database applies
--   them under the wallet row lock, so two parallel requests can never both trigger a guarantee.
--   Natural bonuses are still limited to 100/300/500; guaranteed bonuses may be any value 1..500.
--   Bonus coins still go to the wallet AND the 1,000-coin cash-out counter, exactly as before.
-- Run once in the Supabase SQL editor AFTER 0014 (it only needs 0008). Safe to run again.
-- Until it is installed the route falls back to the old function (no guarantee countdown on screen).

alter table public.wallets add column if not exists lucky_card_cycle_rounds integer not null default 0
  check (lucky_card_cycle_rounds >= 0);

-- the 0008 function (9 arguments) is replaced
drop function if exists public.play_lucky_card(uuid, integer, integer, text, text, integer, integer, integer, integer);

create or replace function public.play_lucky_card(
  p_user_id     uuid,
  p_cost        integer,
  p_card_index  integer,
  p_kind        text,
  p_message_id  text,
  p_bonus_coins integer,
  p_prize_thb   integer,
  p_g1_after    integer default 0,   -- 0 = step 1 disabled
  p_g1_coins    integer default 15,
  p_g2_every    integer default 0,   -- 0 = step 2 disabled
  p_g2_coins    integer default 40
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
  v_tier       text := null;
  v_cycle      integer;
  v_every_due  boolean := false;
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
  if p_g1_after < 0 or p_g1_after > 1000 or p_g2_every < 0 or p_g2_every > 1000
     or p_g1_coins not between 1 and 500 or p_g2_coins not between 1 and 500 then
    raise exception 'INVALID_OUTCOME';
  end if;

  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if v_wallet.balance < p_cost then raise exception 'INSUFFICIENT_COINS'; end if;

  -- continuous round counter for step 2 (this round included); resets when it reaches p_g2_every
  v_cycle := v_wallet.lucky_card_cycle_rounds + 1;
  v_every_due := p_g2_every > 0 and v_cycle >= p_g2_every;

  if v_kind = 'message' then
    if v_every_due then
      v_kind := 'bonus'; v_bonus := p_g2_coins; v_message := null; v_tier := 'every';
    elsif p_g1_after > 0 and v_wallet.lucky_card_dry_rounds + 1 >= p_g1_after then
      v_kind := 'bonus'; v_bonus := p_g1_coins; v_message := null; v_tier := 'dry';
    end if;
  end if;

  insert into public.lucky_card_plays (id, user_id, card_index, result_kind, message_id, bonus_coins)
  values (v_play, p_user_id, p_card_index, v_kind, v_message, v_bonus);

  update public.wallets
  set balance = balance - p_cost + v_bonus,
      lucky_card_bonus_total = lucky_card_bonus_total + v_bonus,
      lucky_card_dry_rounds = case when v_kind = 'message' then lucky_card_dry_rounds + 1 else 0 end,
      lucky_card_cycle_rounds = case when v_every_due then 0 else v_cycle end
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
    'guaranteed', v_tier is not null,
    'guarantee_tier', v_tier,
    'dry_rounds', v_wallet.lucky_card_dry_rounds,
    'cycle_rounds', v_wallet.lucky_card_cycle_rounds
  );
end;
$$;

revoke all on function public.play_lucky_card(uuid, integer, integer, text, text, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.play_lucky_card(uuid, integer, integer, text, text, integer, integer, integer, integer, integer, integer) to service_role;

notify pgrst, 'reload schema';
