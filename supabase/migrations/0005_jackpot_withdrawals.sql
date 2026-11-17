-- Phase 7: 5,000 THB jackpot cash withdrawal.
-- * wallets.jackpot_withdrawals_available: +1 only when a PAID spin wins the 5,000-coin jackpot (set inside spin_wheel_cycle).
-- * withdrawal_requests: one row per request, fixed 5,000 coins = 5,000 THB.
-- * request_jackpot_withdrawal / review_jackpot_withdrawal: SECURITY DEFINER, service_role only.
-- Run once in the Supabase SQL editor AFTER 0004.

alter table public.wallets
  add column if not exists jackpot_withdrawals_available integer not null default 0
  check (jackpot_withdrawals_available >= 0);

-- Ledger reasons for withdrawals
alter table public.wallet_ledger drop constraint if exists wallet_ledger_reason_check;
alter table public.wallet_ledger add constraint wallet_ledger_reason_check
  check (reason in ('tarot', 'birthdate', 'topup', 'spin', 'checkin', 'refund', 'admin', 'withdrawal', 'withdrawal_refund'));

create table if not exists public.withdrawal_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  amount_coins   integer not null default 5000 check (amount_coins = 5000),
  amount_thb     integer not null default 5000 check (amount_thb = 5000),
  bank_name      text not null check (char_length(bank_name) between 1 and 80),
  account_number text not null check (account_number ~ '^[0-9]{6,20}$'),
  account_name   text not null check (char_length(account_name) between 1 and 120),
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  ledger_id      uuid references public.wallet_ledger (id),
  reviewed_by    text,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists withdrawal_requests_user_idx on public.withdrawal_requests (user_id, created_at desc);
create index if not exists withdrawal_requests_status_idx on public.withdrawal_requests (status, created_at);

alter table public.withdrawal_requests enable row level security;
drop policy if exists "withdrawal_requests: read own" on public.withdrawal_requests;
create policy "withdrawal_requests: read own" on public.withdrawal_requests
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete, truncate on public.withdrawal_requests from anon, authenticated;
revoke all on public.withdrawal_requests from anon;

-- -----------------------------------------------------------------------------
-- spin_wheel_cycle: same as 0004, plus +1 jackpot_withdrawals_available on a jackpot win (same transaction).
-- -----------------------------------------------------------------------------
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
      free_reading_tickets = free_reading_tickets + case when v_type = 'free_reading' then v_value else 0 end,
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
    'jackpot_withdrawals_available', v_wallet.jackpot_withdrawals_available
  );
end;
$$;

revoke all on function public.spin_wheel_cycle(uuid, integer, integer, text, text, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.spin_wheel_cycle(uuid, integer, integer, text, text, integer, text, text, integer) to service_role;

-- -----------------------------------------------------------------------------
-- request_jackpot_withdrawal: atomic. Locks the wallet, checks quota + balance >= 5000,
-- deducts exactly 5000 coins, decrements the quota, creates the pending request.
-- -----------------------------------------------------------------------------
create or replace function public.request_jackpot_withdrawal(
  p_user_id        uuid,
  p_bank_name      text,
  p_account_number text,
  p_account_name   text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets%rowtype;
  v_ledger uuid;
  v_req    uuid;
begin
  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if v_wallet.jackpot_withdrawals_available < 1 then raise exception 'NO_WITHDRAWAL_QUOTA'; end if;
  if v_wallet.balance < 5000 then raise exception 'INSUFFICIENT_COINS'; end if;

  update public.wallets
  set balance = balance - 5000,
      jackpot_withdrawals_available = jackpot_withdrawals_available - 1
  where user_id = p_user_id
  returning * into v_wallet;

  insert into public.wallet_ledger (user_id, reason, coins_delta)
  values (p_user_id, 'withdrawal', -5000)
  returning id into v_ledger;

  insert into public.withdrawal_requests (user_id, bank_name, account_number, account_name, ledger_id)
  values (p_user_id, p_bank_name, p_account_number, p_account_name, v_ledger)
  returning id into v_req;

  update public.wallet_ledger set ref_id = v_req where id = v_ledger;

  return jsonb_build_object(
    'request_id', v_req,
    'balance', v_wallet.balance,
    'jackpot_withdrawals_available', v_wallet.jackpot_withdrawals_available
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- review_jackpot_withdrawal: pending -> approved, or pending -> rejected (refund 5000 coins + 1 quota).
-- Row lock makes a double click / double review impossible.
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
  v_req public.withdrawal_requests%rowtype;
  v_wallet public.wallets%rowtype;
begin
  select * into v_req from public.withdrawal_requests where id = p_request_id for update;
  if not found then raise exception 'WITHDRAWAL_NOT_FOUND'; end if;
  if v_req.status <> 'pending' then raise exception 'WITHDRAWAL_ALREADY_REVIEWED'; end if;

  if p_approve then
    update public.withdrawal_requests
    set status = 'approved', reviewed_by = p_reviewer, reviewed_at = now()
    where id = p_request_id;
    return jsonb_build_object('status', 'approved');
  end if;

  select * into v_wallet from public.wallets where user_id = v_req.user_id for update;
  update public.wallets
  set balance = balance + 5000,
      jackpot_withdrawals_available = jackpot_withdrawals_available + 1
  where user_id = v_req.user_id;

  insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id)
  values (v_req.user_id, 'withdrawal_refund', 5000, v_req.id);

  update public.withdrawal_requests
  set status = 'rejected', reviewed_by = p_reviewer, reviewed_at = now()
  where id = p_request_id;
  return jsonb_build_object('status', 'rejected');
end;
$$;

revoke all on function public.request_jackpot_withdrawal(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.review_jackpot_withdrawal(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.request_jackpot_withdrawal(uuid, text, text, text) to service_role;
grant execute on function public.review_jackpot_withdrawal(uuid, boolean, text) to service_role;

notify pgrst, 'reload schema';
