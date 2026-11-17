-- Phase 5b: unlimited paid spins. When the user has no free spin ticket, a spin costs p_cost coins.
-- ONE atomic function decides free vs paid under the wallet row lock (no race between "check" and "charge"),
-- so the route never has to read the wallet first. Also raises the coin-prize cap to 5000 (jackpot),
-- so this migration makes 0002 unnecessary (running both is harmless).
-- Run once in the Supabase SQL editor. service_role only, like the other coin RPCs.

create or replace function public.spin_wheel_any(
  p_user_id      uuid,
  p_reward_key   text,
  p_reward_type  text,
  p_reward_value integer,
  p_cost         integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets%rowtype;
  v_spin   uuid;
  v_paid   boolean;
  v_prize  integer;
begin
  if p_reward_type not in ('coins', 'free_reading', 'none') then
    raise exception 'INVALID_REWARD';
  end if;
  if p_reward_value is null or p_reward_value < 0
     or (p_reward_type = 'coins' and p_reward_value > 5000)
     or (p_reward_type = 'free_reading' and p_reward_value > 5) then
    raise exception 'INVALID_REWARD';
  end if;
  if p_cost is null or p_cost < 1 or p_cost > 1000 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into v_wallet
  from public.wallets where user_id = p_user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  v_paid := v_wallet.spin_tickets < 1;
  if v_paid and v_wallet.balance < p_cost then
    raise exception 'INSUFFICIENT_COINS';
  end if;

  v_prize := case when p_reward_type = 'coins' then p_reward_value else 0 end;

  update public.wallets
  set spin_tickets         = spin_tickets - case when v_paid then 0 else 1 end,
      balance              = balance - case when v_paid then p_cost else 0 end + v_prize,
      free_reading_tickets = free_reading_tickets + case when p_reward_type = 'free_reading' then p_reward_value else 0 end
  where user_id = p_user_id
  returning * into v_wallet;

  insert into public.spin_logs (user_id, reward_key, reward_type, reward_value)
  values (p_user_id, p_reward_key, p_reward_type, p_reward_value)
  returning id into v_spin;

  if v_paid then
    insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id)
    values (p_user_id, 'spin', -p_cost, v_spin);
  else
    insert into public.wallet_ledger (user_id, reason, spin_tickets_delta, ref_id)
    values (p_user_id, 'spin', -1, v_spin);
  end if;

  if v_prize > 0 or p_reward_type = 'free_reading' then
    insert into public.wallet_ledger (user_id, reason, coins_delta, free_reading_tickets_delta, ref_id)
    values (
      p_user_id, 'spin', v_prize,
      case when p_reward_type = 'free_reading' then p_reward_value else 0 end,
      v_spin
    );
  end if;

  return jsonb_build_object(
    'spin_log_id', v_spin,
    'paid', v_paid,
    'balance', v_wallet.balance,
    'spin_tickets', v_wallet.spin_tickets,
    'free_reading_tickets', v_wallet.free_reading_tickets
  );
end;
$$;

revoke all on function public.spin_wheel_any(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.spin_wheel_any(uuid, text, text, integer, integer) to service_role;

-- Make PostgREST pick up the new function immediately.
notify pgrst, 'reload schema';
