-- Wheel "มือขึ้น 5 ตาติด" (5-spin hot streak).
--   * wallets.hot_streak_rounds: spins left in the streak (0 = none).
--   * A streak STARTS after a PAID spin when the route's crypto roll (p_hot_trigger, 1 in 250) says so and no streak is running.
--     The streak affects the NEXT 5 spins (free or paid): their reward is the "hot" draw the route passes in (p_hot_reward_*:
--     80% coin prize, weighted to 20/40, no luck card). Each spin of the streak counts it down 5 -> 0.
--   * Reward precedence: jackpot > luck-card buff (always a prize) > hot streak > ordinary. A running streak requires a hot reward to be passed.
--   * Randomness stays in the route (crypto); the database only applies it under the wallet lock, so two tabs cannot double-start or double-count.
-- Same function name as 0013 with 5 extra defaulted parameters (the 13-argument version is dropped so the two can never be ambiguous).
-- Run in the Supabase SQL editor AFTER 0013. Safe to run more than once.

alter table public.wallets add column if not exists hot_streak_rounds integer not null default 0 check (hot_streak_rounds between 0 and 10);

drop function if exists public.spin_wheel_cycle(uuid, integer, integer, text, text, integer, text, text, integer, text, text, integer, integer);

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
  p_buff_reward_value integer default null,
  p_cash_pct          integer default 0,      -- % of a coin prize that also goes to wallets.wheel_cash_total (paid, non-jackpot spins only)
  p_hot_trigger       boolean default false,  -- the route's crypto roll: "start a hot streak after this spin" (used only on a PAID spin outside a streak)
  p_hot_reward_key    text    default null,   -- the reward drawn from the HOT odds (80% coin prize), used while hot_streak_rounds > 0
  p_hot_reward_type   text    default null,
  p_hot_reward_value  integer default null,
  p_hot_rounds        integer default 5
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
  v_hot     boolean := false;
  v_hot_started boolean := false;
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
    -- luck-card buff rule: while the buff runs every spin wins something, so the buffed reward can never be "retry"
    if p_buff_reward_type = 'none' then
      raise exception 'INVALID_REWARD';
    end if;
    if p_buff_reward_type is null or p_buff_reward_value is null or p_buff_reward_value < 0
       or (p_buff_reward_type = 'coins' and p_buff_reward_value > 1000)
       or (p_buff_reward_type in ('free_reading', 'luck_card') and p_buff_reward_value > 5) then
      raise exception 'INVALID_REWARD';
    end if;
  end if;
  if p_cash_pct is null or p_cash_pct < 0 or p_cash_pct > 100
     or p_hot_rounds is null or p_hot_rounds < 1 or p_hot_rounds > 10 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_hot_reward_key is not null then
    if p_hot_reward_type is null or p_hot_reward_type not in ('coins', 'free_reading', 'none')
       or p_hot_reward_value is null or p_hot_reward_value < 0
       or (p_hot_reward_type = 'coins' and p_hot_reward_value > 1000)
       or (p_hot_reward_type = 'free_reading' and p_hot_reward_value > 5) then
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

  -- the luck-card buff applies to this spin if it was running when the spin started. While it runs the caller MUST pass a buffed
  -- (never "retry") reward, so a buffed spin cannot end as "retry" whatever the caller does.
  if v_wallet.luck_buff_rounds > 0 and p_buff_reward_key is null then
    raise exception 'INVALID_REWARD';
  end if;
  v_buffed := v_wallet.luck_buff_rounds > 0 and p_buff_reward_key is not null;

  -- hot streak ("มือขึ้น 5 ตาติด"): the next p_hot_rounds spins use the hot reward (80% coin prize). A running streak requires the caller to
  -- pass a hot reward. Precedence of rewards: jackpot > luck-card buff (always a prize) > hot streak > ordinary.
  if v_wallet.hot_streak_rounds > 0 and p_hot_reward_key is null then
    raise exception 'INVALID_REWARD';
  end if;
  v_hot := v_wallet.hot_streak_rounds > 0 and p_hot_reward_key is not null;
  -- a new streak starts only on a PAID spin outside a streak, and only when the route's crypto roll said so; it affects the NEXT spins
  v_hot_started := v_wallet.hot_streak_rounds = 0 and v_paid and coalesce(p_hot_trigger, false);

  if v_jackpot then
    v_key := p_jackpot_key; v_type := p_jackpot_type; v_value := p_jackpot_value;
  elsif v_buffed then
    v_key := p_buff_reward_key; v_type := p_buff_reward_type; v_value := p_buff_reward_value;
  elsif v_hot then
    v_key := p_hot_reward_key; v_type := p_hot_reward_type; v_value := p_hot_reward_value;
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
      hot_streak_rounds    = case when hot_streak_rounds > 0 then hot_streak_rounds - 1 when v_hot_started then p_hot_rounds else 0 end,
      -- cash tally: only PAID spins, never the jackpot (it has its own withdrawal), integer division like cashCredit() in the app
      wheel_cash_total     = wheel_cash_total + case when v_paid and not v_jackpot and v_type = 'coins' then (v_value * p_cash_pct) / 100 else 0 end,
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
    'buff_applied', v_buffed,
    'wheel_cash_total', v_wallet.wheel_cash_total,
    'hot_streak_rounds', v_wallet.hot_streak_rounds,
    'hot_applied', (v_hot and not v_buffed and not v_jackpot),
    'hot_started', v_hot_started
  );
end;
$$;

revoke all on function public.spin_wheel_cycle(uuid, integer, integer, text, text, integer, text, text, integer, text, text, integer, integer, boolean, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.spin_wheel_cycle(uuid, integer, integer, text, text, integer, text, text, integer, text, text, integer, integer, boolean, text, text, integer, integer) to service_role;

notify pgrst, 'reload schema';
