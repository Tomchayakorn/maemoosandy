-- Phase 5: allow the 5,000-coin wheel jackpot.
-- 0001 capped a coins reward at 1000 inside spin_wheel(); raise it to 5000.
-- Run once in the Supabase SQL editor. Privileges (service_role only) are kept by CREATE OR REPLACE.

create or replace function public.spin_wheel(
  p_user_id      uuid,
  p_reward_key   text,
  p_reward_type  text,
  p_reward_value integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets%rowtype;
  v_spin   uuid;
begin
  if p_reward_type not in ('coins', 'free_reading', 'none') then
    raise exception 'INVALID_REWARD';
  end if;
  if p_reward_value is null or p_reward_value < 0
     or (p_reward_type = 'coins' and p_reward_value > 5000)
     or (p_reward_type = 'free_reading' and p_reward_value > 5) then
    raise exception 'INVALID_REWARD';
  end if;

  select * into v_wallet
  from public.wallets where user_id = p_user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;
  if v_wallet.spin_tickets < 1 then
    raise exception 'NO_SPIN_TICKETS';
  end if;

  update public.wallets
  set spin_tickets         = spin_tickets - 1,
      balance              = balance + case when p_reward_type = 'coins' then p_reward_value else 0 end,
      free_reading_tickets = free_reading_tickets + case when p_reward_type = 'free_reading' then p_reward_value else 0 end
  where user_id = p_user_id
  returning * into v_wallet;

  insert into public.spin_logs (user_id, reward_key, reward_type, reward_value)
  values (p_user_id, p_reward_key, p_reward_type, p_reward_value)
  returning id into v_spin;

  insert into public.wallet_ledger
    (user_id, reason, coins_delta, spin_tickets_delta, free_reading_tickets_delta, ref_id)
  values (
    p_user_id, 'spin',
    case when p_reward_type = 'coins' then p_reward_value else 0 end,
    -1,
    case when p_reward_type = 'free_reading' then p_reward_value else 0 end,
    v_spin
  );

  return jsonb_build_object(
    'spin_log_id', v_spin,
    'balance', v_wallet.balance,
    'spin_tickets', v_wallet.spin_tickets,
    'free_reading_tickets', v_wallet.free_reading_tickets
  );
end;
$$;
