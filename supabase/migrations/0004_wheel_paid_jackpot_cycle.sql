-- Phase 6b: 200-paid-spin jackpot cycle.
-- A global counter (public.wheel_state.paid_spin_count) counts PAID spins only (99 coins).
-- Free-ticket spins never touch it and can never win the 5,000-coin jackpot.
-- Every paid spin whose number is a multiple of p_jackpot_every (#200, #400, ...) is locked to the jackpot.
--
-- Concurrency: the wallet row is locked first, then the single wheel_state row is incremented with UPDATE ... RETURNING.
-- That row lock serialises paid spins across all users until commit, so two spins can never get the same number, and a
-- rolled-back spin (e.g. INSUFFICIENT_COINS) rolls its increment back too. Lock order is always wallet -> wheel_state.
-- The server pre-draws the ordinary reward (jackpot excluded) and passes it in; this function swaps in the jackpot
-- reward on the 200th paid spin, and credits the prize in the same transaction.
-- Run once in the Supabase SQL editor (replaces the need for 0002/0003 for the wheel). service_role only.

create table if not exists public.wheel_state (
  id              integer primary key check (id = 1),
  paid_spin_count bigint  not null default 0 check (paid_spin_count >= 0),
  updated_at      timestamptz not null default now()
);
-- Seed with the paid spins already made (the fallback numbers spins by counting these ledger rows), so numbering continues seamlessly.
insert into public.wheel_state (id, paid_spin_count)
select 1, count(*) from public.wallet_ledger where reason = 'spin' and coins_delta = -99
on conflict (id) do nothing;

-- RLS on with no policies = no client access at all (service_role bypasses RLS).
alter table public.wheel_state enable row level security;
revoke all on public.wheel_state from anon, authenticated;

-- Audit: which paid spin number this log row was (null for free-ticket spins).
alter table public.spin_logs add column if not exists paid_spin_number bigint;

create or replace function public.spin_wheel_cycle(
  p_user_id         uuid,
  p_cost            integer,
  p_jackpot_every   integer,
  p_reward_key      text,
  p_reward_type     text,
  p_reward_value    integer,
  p_jackpot_key     text,
  p_jackpot_type    text,
  p_jackpot_value   integer
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
  v_key     text;
  v_type    text;
  v_value   integer;
  v_prize   integer;
begin
  if p_reward_type not in ('coins', 'free_reading', 'none')
     or p_jackpot_type not in ('coins', 'free_reading', 'none') then
    raise exception 'INVALID_REWARD';
  end if;
  if p_reward_value is null or p_reward_value < 0
     or (p_reward_type = 'coins' and p_reward_value > 1000)
     or (p_reward_type = 'free_reading' and p_reward_value > 5)
     or p_jackpot_value is null or p_jackpot_value < 0
     or (p_jackpot_type = 'coins' and p_jackpot_value > 5000)
     or (p_jackpot_type = 'free_reading' and p_jackpot_value > 5) then
    raise exception 'INVALID_REWARD';
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

  if v_jackpot then
    v_key := p_jackpot_key; v_type := p_jackpot_type; v_value := p_jackpot_value;
  else
    v_key := p_reward_key;  v_type := p_reward_type;  v_value := p_reward_value;
  end if;
  v_prize := case when v_type = 'coins' then v_value else 0 end;

  update public.wallets
  set spin_tickets         = spin_tickets - case when v_paid then 0 else 1 end,
      balance              = balance - case when v_paid then p_cost else 0 end + v_prize,
      free_reading_tickets = free_reading_tickets + case when v_type = 'free_reading' then v_value else 0 end
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
    'free_reading_tickets', v_wallet.free_reading_tickets
  );
end;
$$;

revoke all on function public.spin_wheel_cycle(uuid, integer, integer, text, text, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.spin_wheel_cycle(uuid, integer, integer, text, text, integer, text, text, integer) to service_role;

notify pgrst, 'reload schema';
