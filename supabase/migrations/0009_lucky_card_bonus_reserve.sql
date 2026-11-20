-- "ดวงดี มีเฮ": accumulated-bonus cash-out now RESERVES the 1,000 coins when the request is created (was: at approval).
--   * request: lock wallet (FOR UPDATE) -> one pending request per user (idempotent) -> check counter >= 1,000
--              -> counter -1,000 immediately -> insert request with bonus_reserved = true. Two tabs / two devices can't both pass.
--   * approve: status only (the coins were already taken at request time).
--   * reject / cancel: counter +1,000 back (only if that request had reserved them), status = rejected.
--   * withdrawal_requests.bonus_reserved: whether the request currently holds 1,000 reserved coins. It makes this migration
--     idempotent and keeps legacy 0007-style pending requests (nothing reserved yet) correct.
-- Run once in the Supabase SQL editor AFTER 0008. All RPCs are service_role only.

alter table public.withdrawal_requests add column if not exists bonus_reserved boolean not null default false;

-- One-time conversion of requests that were created under the old rule (still pending, nothing deducted yet).
-- Re-running is safe: after the first run no pending bonus request has bonus_reserved = false.
update public.wallets w
set lucky_card_bonus_total = greatest(w.lucky_card_bonus_total - r.amount_coins, 0)
from public.withdrawal_requests r
where r.user_id = w.user_id
  and r.source = 'lucky_card_bonus' and r.status = 'pending' and r.bonus_reserved = false;

update public.withdrawal_requests
set bonus_reserved = true
where source = 'lucky_card_bonus' and status = 'pending' and bonus_reserved = false;

-- -----------------------------------------------------------------------------
-- request_lucky_card_bonus_withdrawal: reserve 1,000 now; idempotent while one is pending.
-- -----------------------------------------------------------------------------
create or replace function public.request_lucky_card_bonus_withdrawal(
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
  v_wallet   public.wallets%rowtype;
  v_existing uuid;
  v_req      uuid;
begin
  -- the wallet row lock serialises every request/play of this user (2 tabs, 2 devices, double click)
  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  -- already waiting for the admin: hand back the same request, reserve nothing more
  select id into v_existing from public.withdrawal_requests
  where user_id = p_user_id and source = 'lucky_card_bonus' and status = 'pending';
  if found then
    return jsonb_build_object('request_id', v_existing, 'amount_thb', 1000,
                              'bonus_total', v_wallet.lucky_card_bonus_total, 'already_pending', true);
  end if;

  if v_wallet.lucky_card_bonus_total < 1000 then raise exception 'BONUS_NOT_ENOUGH'; end if;

  update public.wallets
  set lucky_card_bonus_total = lucky_card_bonus_total - 1000
  where user_id = p_user_id
  returning * into v_wallet;

  insert into public.withdrawal_requests
    (user_id, amount_coins, amount_thb, bank_name, account_number, account_name, source, bonus_reserved)
  values
    (p_user_id, 1000, 1000, p_bank_name, p_account_number, p_account_name, 'lucky_card_bonus', true)
  returning id into v_req;

  return jsonb_build_object('request_id', v_req, 'amount_thb', 1000,
                            'bonus_total', v_wallet.lucky_card_bonus_total, 'already_pending', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- review_jackpot_withdrawal (replaces 0007): bonus requests are reserved at request time.
--   approve: status only (legacy un-reserved pending request: deduct now, defensive)
--   reject:  +1,000 back to the counter if the request had reserved it
-- Lock order stays request row -> wallet row.
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

revoke all on function public.request_lucky_card_bonus_withdrawal(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.review_jackpot_withdrawal(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.request_lucky_card_bonus_withdrawal(uuid, text, text, text) to service_role;
grant execute on function public.review_jackpot_withdrawal(uuid, boolean, text) to service_role;

notify pgrst, 'reload schema';
