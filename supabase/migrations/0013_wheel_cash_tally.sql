-- Wheel "ยอดสะสมจากการหมุนเกม" (cash tally) + tiered cash-out (500 / 5,000).
--   * wallets.wheel_cash_total: separate from the main balance. Every PAID, non-jackpot spin that wins coins adds p_cash_pct % (25) of the
--     prize to it, in the same statement as the prize (spin_wheel_cycle). Free-ticket spins and the jackpot never add to it.
--   * request_wheel_cash_withdrawal: tier 500 (small, quota per Bangkok day / week) or 5,000 (big, no quota). Locks the wallet FOR UPDATE,
--     returns the existing request if one is pending (one pending per user, idempotent), needs tally >= tier, then RESERVES the tier
--     (tally - tier) and creates withdrawal_requests(source = 'wheel_cash', bonus_reserved = true).
--   * review_jackpot_withdrawal: approve = status only; reject = tally + tier back (quota slot is freed because rejected rows don't count).
-- No backfill: the tally starts at 0 for everyone (past spins are not counted).
-- Run in the Supabase SQL editor AFTER 0012. Safe to run more than once.

alter table public.wallets add column if not exists wheel_cash_total integer not null default 0 check (wheel_cash_total >= 0);

alter table public.withdrawal_requests drop constraint if exists withdrawal_requests_source_check;
alter table public.withdrawal_requests add constraint withdrawal_requests_source_check
  check (source in ('jackpot', 'lucky_card', 'lucky_card_bonus', 'wheel_cash'));
create unique index if not exists withdrawal_requests_wheel_cash_pending_uidx
  on public.withdrawal_requests (user_id) where source = 'wheel_cash' and status = 'pending';
create index if not exists withdrawal_requests_wheel_cash_quota_idx
  on public.withdrawal_requests (user_id, created_at desc) where source = 'wheel_cash';

-- spin_wheel_cycle gets a 13th (defaulted) parameter: drop the 12-argument version so the two can never be ambiguous
drop function if exists public.spin_wheel_cycle(uuid, integer, integer, text, text, integer, text, text, integer, text, text, integer);

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
  p_cash_pct          integer default 0       -- % of a coin prize that also goes to wallets.wheel_cash_total (paid, non-jackpot spins only)
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
  if p_cash_pct is null or p_cash_pct < 0 or p_cash_pct > 100 then
    raise exception 'INVALID_AMOUNT';
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
    'wheel_cash_total', v_wallet.wheel_cash_total
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- request_wheel_cash_withdrawal
-- -----------------------------------------------------------------------------
create or replace function public.request_wheel_cash_withdrawal(
  p_user_id        uuid,
  p_tier           integer,
  p_bank_name      text,
  p_account_number text,
  p_account_name   text,
  p_daily_limit    integer,
  p_weekly_limit   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet     public.wallets%rowtype;
  v_existing   public.withdrawal_requests%rowtype;
  v_req        uuid;
  v_day_start  timestamptz;
  v_week_start timestamptz;
  v_day        integer;
  v_week       integer;
begin
  if p_tier not in (500, 5000) then raise exception 'INVALID_TIER'; end if;
  if p_daily_limit is null or p_daily_limit < 1 or p_daily_limit > 100
     or p_weekly_limit is null or p_weekly_limit < 1 or p_weekly_limit > 700 then
    raise exception 'INVALID_AMOUNT';
  end if;

  -- the wallet row lock serialises every spin/request of this user (2 tabs, 2 devices, double click)
  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  -- one pending cash-out per user: hand back the same request, reserve nothing more
  select * into v_existing from public.withdrawal_requests
  where user_id = p_user_id and source = 'wheel_cash' and status = 'pending';
  if found then
    return jsonb_build_object('request_id', v_existing.id, 'amount_thb', v_existing.amount_thb,
                              'wheel_cash_total', v_wallet.wheel_cash_total, 'already_pending', true);
  end if;

  if v_wallet.wheel_cash_total < p_tier then raise exception 'WHEEL_CASH_NOT_ENOUGH'; end if;

  if p_tier = 500 then
    -- quota for the small tier, by Bangkok calendar day / week (Monday start); pending + approved count, rejected don't
    v_day_start  := date_trunc('day',  now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
    v_week_start := date_trunc('week', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
    select count(*) filter (where created_at >= v_day_start), count(*) filter (where created_at >= v_week_start)
      into v_day, v_week
    from public.withdrawal_requests
    where user_id = p_user_id and source = 'wheel_cash' and amount_thb = 500 and status in ('pending', 'approved');
    if v_day  >= p_daily_limit  then raise exception 'WHEEL_CASH_DAILY_LIMIT';  end if;
    if v_week >= p_weekly_limit then raise exception 'WHEEL_CASH_WEEKLY_LIMIT'; end if;
  end if;

  update public.wallets set wheel_cash_total = wheel_cash_total - p_tier
  where user_id = p_user_id returning * into v_wallet;

  insert into public.withdrawal_requests
    (user_id, amount_coins, amount_thb, bank_name, account_number, account_name, source, bonus_reserved)
  values
    (p_user_id, p_tier, p_tier, p_bank_name, p_account_number, p_account_name, 'wheel_cash', true)
  returning id into v_req;

  return jsonb_build_object('request_id', v_req, 'amount_thb', p_tier,
                            'wheel_cash_total', v_wallet.wheel_cash_total, 'already_pending', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- review_jackpot_withdrawal (replaces 0009): adds the wheel_cash source
-- -----------------------------------------------------------------------------
create or replace function public.review_jackpot_withdrawal(
  p_request_id uuid,
  p_approve    boolean,
  p_reviewer   text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req    public.withdrawal_requests%rowtype;
  v_wallet public.wallets%rowtype;
begin
  select * into v_req from public.withdrawal_requests where id = p_request_id for update;
  if not found then raise exception 'WITHDRAWAL_NOT_FOUND'; end if;
  if v_req.status <> 'pending' then raise exception 'WITHDRAWAL_ALREADY_REVIEWED'; end if;

  if p_approve then
    if v_req.source = 'lucky_card_bonus' and not v_req.bonus_reserved then
      select * into v_wallet from public.wallets where user_id = v_req.user_id for update;
      if v_wallet.lucky_card_bonus_total < v_req.amount_coins then raise exception 'BONUS_NOT_ENOUGH'; end if;
      update public.wallets
      set lucky_card_bonus_total = lucky_card_bonus_total - v_req.amount_coins
      where user_id = v_req.user_id;
    end if;
    update public.withdrawal_requests
    set status = 'approved', reviewed_by = p_reviewer, reviewed_at = now()
    where id = p_request_id;
    return jsonb_build_object('status', 'approved');
  end if;

  if v_req.source = 'lucky_card' then
    update public.lucky_card_prizes set status = 'pending', withdrawal_request_id = null where id = v_req.prize_id;
  elsif v_req.source = 'wheel_cash' then
    -- the tally coins were reserved when the request was created: give them back (a rejected request also frees its quota slot)
    if v_req.bonus_reserved then
      select * into v_wallet from public.wallets where user_id = v_req.user_id for update;
      update public.wallets
      set wheel_cash_total = wheel_cash_total + v_req.amount_coins
      where user_id = v_req.user_id;
    end if;
  elsif v_req.source = 'lucky_card_bonus' then
    if v_req.bonus_reserved then
      select * into v_wallet from public.wallets where user_id = v_req.user_id for update;
      update public.wallets
      set lucky_card_bonus_total = lucky_card_bonus_total + v_req.amount_coins
      where user_id = v_req.user_id;
    end if;
  else
    select * into v_wallet from public.wallets where user_id = v_req.user_id for update;
    update public.wallets
    set balance = balance + v_req.amount_coins,
        jackpot_withdrawals_available = jackpot_withdrawals_available + 1
    where user_id = v_req.user_id;

    insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id)
    values (v_req.user_id, 'withdrawal_refund', v_req.amount_coins, v_req.id);
  end if;

  update public.withdrawal_requests
  set status = 'rejected', bonus_reserved = false, reviewed_by = p_reviewer, reviewed_at = now()
  where id = p_request_id;
  return jsonb_build_object('status', 'rejected');
end;
$$;

revoke all on function public.spin_wheel_cycle(uuid, integer, integer, text, text, integer, text, text, integer, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.request_wheel_cash_withdrawal(uuid, integer, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.review_jackpot_withdrawal(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.spin_wheel_cycle(uuid, integer, integer, text, text, integer, text, text, integer, text, text, integer, integer) to service_role;
grant execute on function public.request_wheel_cash_withdrawal(uuid, integer, text, text, text, integer, integer) to service_role;
grant execute on function public.review_jackpot_withdrawal(uuid, boolean, text) to service_role;

notify pgrst, 'reload schema';
