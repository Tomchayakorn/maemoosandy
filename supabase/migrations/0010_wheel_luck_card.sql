-- Lucky wheel: "การ์ด +ความเฮง" (luck card).
--   * A new wheel prize type 'luck_card'. Winning one adds a card to wallets.luck_cards (kept until used).
--   * A card is kept in wallets.luck_cards no matter how many coins the player has left (it is credited in the same statement as the
--     prize, with no balance condition), so winning one with 0 coins never loses it.
--   * use_luck_card: spends one card and starts a buff of N spins (wallets.luck_buff_rounds). Refused while a buff is running
--     (BUFF_ALREADY_ACTIVE), with no card (NO_LUCK_CARDS), or when the player cannot spin right now (no free ticket and fewer than
--     p_min_balance coins -> INSUFFICIENT_COINS), so a double click / second tab can never waste a card or stack buffs, and a buff is
--     never started that could not be used. A spin that fails for lack of coins rolls back completely (no round used).
--   * spin_wheel_cycle: same as 0005 plus
--       - an optional second, "buffed" reward (p_buff_reward_*): when wallets.luck_buff_rounds > 0 at the start of the spin it is
--         used instead of the ordinary reward (the route draws both with crypto; the database only picks under the wallet lock)
--       - one buff round is used up per spin (free or paid); the jackpot spin also uses one
--       - a 'luck_card' reward adds one card
--     The returned reward_key tells the route which reward was really applied.
-- Run in the Supabase SQL editor AFTER 0009. Safe to run again (e.g. if you already ran an earlier version of this file).
-- If it is not installed yet the route keeps working (luck-card draws become "retry").

alter table public.wallets add column if not exists luck_cards integer not null default 0 check (luck_cards >= 0);
alter table public.wallets add column if not exists luck_buff_rounds integer not null default 0 check (luck_buff_rounds between 0 and 10);

alter table public.spin_logs drop constraint if exists spin_logs_reward_type_check;
alter table public.spin_logs add constraint spin_logs_reward_type_check
  check (reward_type in ('coins', 'free_reading', 'luck_card', 'none'));

-- -----------------------------------------------------------------------------
-- use_luck_card
-- -----------------------------------------------------------------------------
-- an earlier version had no p_min_balance parameter: drop it so the two signatures can never be ambiguous
drop function if exists public.use_luck_card(uuid, integer);

create or replace function public.use_luck_card(p_user_id uuid, p_rounds integer default 3, p_min_balance integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets%rowtype;
begin
  if p_rounds is null or p_rounds < 1 or p_rounds > 10
     or p_min_balance is null or p_min_balance < 0 or p_min_balance > 1000 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if v_wallet.luck_buff_rounds > 0 then raise exception 'BUFF_ALREADY_ACTIVE'; end if;
  if v_wallet.luck_cards < 1 then raise exception 'NO_LUCK_CARDS'; end if;
  -- can the player spin right now? (free ticket, or enough coins for a paid spin)
  if v_wallet.spin_tickets < 1 and v_wallet.balance < p_min_balance then raise exception 'INSUFFICIENT_COINS'; end if;

  update public.wallets
  set luck_cards = luck_cards - 1, luck_buff_rounds = p_rounds
  where user_id = p_user_id
  returning * into v_wallet;

  return jsonb_build_object('luck_cards', v_wallet.luck_cards, 'luck_buff_rounds', v_wallet.luck_buff_rounds);
end;
$$;

-- -----------------------------------------------------------------------------
-- spin_wheel_cycle (replaces 0005): luck cards + buffed reward
-- -----------------------------------------------------------------------------
drop function if exists public.spin_wheel_cycle(uuid, integer, integer, text, text, integer, text, text, integer);

create or replace function public.spin_wheel_cycle(
  p_user_id           uuid,
  p_cost              integer,
  p_jackpot_every     integer,
  p_reward_key        text,
  p_reward_type       text,
  p_reward_value      integer,
  p_jackpot_key       text,
  p_jackpot_type      text,
  p_jackpot_value     integer,
  p_buff_reward_key   text    default null,
  p_buff_reward_type  text    default null,
  p_buff_reward_value integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet  public.wallets%rowtype;
  v_spin    uuid;
  v_paid    boolean;
  v_n       bigint;
  v_jackpot boolean := false;
  v_buffed  boolean := false;
  v_key     text;
  v_type    text;
  v_value   integer;
  v_prize   integer;
begin
  if p_reward_type not in ('coins', 'free_reading', 'luck_card', 'none')
     or p_jackpot_type not in ('coins', 'free_reading', 'luck_card', 'none')
     or (p_buff_reward_type is not null and p_buff_reward_type not in ('coins', 'free_reading', 'luck_card', 'none')) then
    raise exception 'INVALID_REWARD';
  end if;
  if p_reward_value is null or p_reward_value < 0
     or (p_reward_type = 'coins' and p_reward_value > 1000)
     or (p_reward_type in ('free_reading', 'luck_card') and p_reward_value > 5)
     or p_jackpot_value is null or p_jackpot_value < 0
     or (p_jackpot_type = 'coins' and p_jackpot_value > 5000)
     or (p_jackpot_type in ('free_reading', 'luck_card') and p_jackpot_value > 5) then
    raise exception 'INVALID_REWARD';
  end if;
  if p_buff_reward_key is not null then
    if p_buff_reward_type is null or p_buff_reward_value is null or p_buff_reward_value < 0
       or (p_buff_reward_type = 'coins' and p_buff_reward_value > 1000)
       or (p_buff_reward_type in ('free_reading', 'luck_card') and p_buff_reward_value > 5) then
      raise exception 'INVALID_REWARD';
    end if;
  end if;
  if p_cost is null or p_cost < 1 or p_cost > 1000
     or p_jackpot_every is null or p_jackpot_every < 2 or p_jackpot_every > 100000 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  v_paid := v_wallet.spin_tickets < 1;
  if v_paid and v_wallet.balance < p_cost then
    raise exception 'INSUFFICIENT_COINS';
  end if;

  if v_paid then
    update public.wheel_state
    set paid_spin_count = paid_spin_count + 1, updated_at = now()
    where id = 1
    returning paid_spin_count into v_n;
    if v_n is null then
      raise exception 'WHEEL_STATE_MISSING';
    end if;
    v_jackpot := (v_n % p_jackpot_every) = 0;
  end if;

  -- the luck-card buff applies to this spin if it was running when the spin started
  v_buffed := v_wallet.luck_buff_rounds > 0 and p_buff_reward_key is not null;

  if v_jackpot then
    v_key := p_jackpot_key; v_type := p_jackpot_type; v_value := p_jackpot_value;
  elsif v_buffed then
    v_key := p_buff_reward_key; v_type := p_buff_reward_type; v_value := p_buff_reward_value;
  else
    v_key := p_reward_key;  v_type := p_reward_type;  v_value := p_reward_value;
  end if;
  v_prize := case when v_type = 'coins' then v_value else 0 end;

  update public.wallets
  set spin_tickets         = spin_tickets - case when v_paid then 0 else 1 end,
      balance              = balance - case when v_paid then p_cost else 0 end + v_prize,
      free_reading_tickets = free_reading_tickets + case when v_type = 'free_reading' then v_value else 0 end,
      luck_cards           = luck_cards + case when v_type = 'luck_card' then v_value else 0 end,
      luck_buff_rounds     = greatest(luck_buff_rounds - case when luck_buff_rounds > 0 then 1 else 0 end, 0),
      jackpot_withdrawals_available = jackpot_withdrawals_available + case when v_jackpot then 1 else 0 end
  where user_id = p_user_id
  returning * into v_wallet;

  insert into public.spin_logs (user_id, reward_key, reward_type, reward_value, paid_spin_number)
  values (p_user_id, v_key, v_type, v_value, v_n)
  returning id into v_spin;

  if v_paid then
    insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id)
    values (p_user_id, 'spin', -p_cost, v_spin);
  else
    insert into public.wallet_ledger (user_id, reason, spin_tickets_delta, ref_id)
    values (p_user_id, 'spin', -1, v_spin);
  end if;

  if v_prize > 0 or v_type = 'free_reading' then
    insert into public.wallet_ledger (user_id, reason, coins_delta, free_reading_tickets_delta, ref_id)
    values (p_user_id, 'spin', v_prize, case when v_type = 'free_reading' then v_value else 0 end, v_spin);
  end if;

  return jsonb_build_object(
    'spin_log_id', v_spin,
    'paid', v_paid,
    'jackpot', v_jackpot,
    'paid_spin_number', v_n,
    'reward_key', v_key,
    'balance', v_wallet.balance,
    'spin_tickets', v_wallet.spin_tickets,
    'free_reading_tickets', v_wallet.free_reading_tickets,
    'jackpot_withdrawals_available', v_wallet.jackpot_withdrawals_available,
    'luck_cards', v_wallet.luck_cards,
    'luck_buff_rounds', v_wallet.luck_buff_rounds,
    'buff_applied', v_buffed
  );
end;
$$;

revoke all on function public.use_luck_card(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.spin_wheel_cycle(uuid, integer, integer, text, text, integer, text, text, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.use_luck_card(uuid, integer, integer) to service_role;
grant execute on function public.spin_wheel_cycle(uuid, integer, integer, text, text, integer, text, text, integer, text, text, integer) to service_role;

notify pgrst, 'reload schema';
