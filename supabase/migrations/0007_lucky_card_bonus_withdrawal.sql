-- "ดวงดี มีเฮ": accumulated-bonus cash-out (target 1,000 coins -> 1,000 THB).
--  * wallets.lucky_card_bonus_total: running total of bonus coins won in THIS game only. Never reset by itself;
--    only an APPROVED bonus withdrawal subtracts 1,000. The main balance is untouched by it.
--  * play_lucky_card: same as 0006 (charge 20, credit bonus to the main balance) + adds the bonus to the counter in the SAME
--    statement, under the same wallet lock, so coins and counter can never disagree.
--  * withdrawal_requests.source gets 'lucky_card_bonus' (fixed 1,000). Statuses reuse pending / approved / rejected (= cancelled).
--    A partial unique index allows ONE pending request per user (double click / lost connection / second tab).
--  * request_lucky_card_bonus_withdrawal: idempotent — if a request is already pending it is returned, not duplicated.
--  * review_jackpot_withdrawal: approving a bonus request deducts 1,000 from the counter only; rejecting changes status only.
-- Run once in the Supabase SQL editor AFTER 0006. All RPCs are service_role only.

-- Counter + one-time backfill from past plays (guarded so re-running never overwrites a live counter)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallets' and column_name = 'lucky_card_bonus_total'
  ) then
    alter table public.wallets add column lucky_card_bonus_total integer not null default 0
      check (lucky_card_bonus_total >= 0);
    update public.wallets w
    set lucky_card_bonus_total = coalesce(
      (select sum(p.bonus_coins) from public.lucky_card_plays p where p.user_id = w.user_id), 0);
  end if;
end $$;

-- withdrawal_requests: new source + one pending bonus request per user
alter table public.withdrawal_requests drop constraint if exists withdrawal_requests_source_check;
alter table public.withdrawal_requests add constraint withdrawal_requests_source_check
  check (source in ('jackpot', 'lucky_card', 'lucky_card_bonus'));
create unique index if not exists withdrawal_requests_bonus_pending_uidx
  on public.withdrawal_requests (user_id)
  where source = 'lucky_card_bonus' and status = 'pending';

-- -----------------------------------------------------------------------------
-- play_lucky_card (replaces 0006): also accumulates the bonus counter
-- -----------------------------------------------------------------------------
create or replace function public.play_lucky_card(
  p_user_id     uuid,
  p_cost        integer,
  p_card_index  integer,
  p_kind        text,
  p_message_id  text,
  p_bonus_coins integer,
  p_prize_thb   integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets%rowtype;
  v_play   uuid := gen_random_uuid();
  v_prize  uuid;
  v_bonus  integer := 0;
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

  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if v_wallet.balance < p_cost then raise exception 'INSUFFICIENT_COINS'; end if;

  insert into public.lucky_card_plays (id, user_id, card_index, result_kind, message_id, bonus_coins)
  values (v_play, p_user_id, p_card_index, p_kind, p_message_id, v_bonus);

  update public.wallets
  set balance = balance - p_cost + v_bonus,
      lucky_card_bonus_total = lucky_card_bonus_total + v_bonus
  where user_id = p_user_id returning * into v_wallet;

  insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id)
  values (p_user_id, 'luckycard', -p_cost, v_play);
  if v_bonus > 0 then
    insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id)
    values (p_user_id, 'luckycard_bonus', v_bonus, v_play);
  end if;

  if p_kind = 'secret' then
    insert into public.lucky_card_prizes (user_id, play_id, amount_thb)
    values (p_user_id, v_play, p_prize_thb) returning id into v_prize;
    update public.lucky_card_plays set prize_id = v_prize where id = v_play;
  end if;

  return jsonb_build_object(
    'play_id', v_play,
    'balance', v_wallet.balance,
    'prize_id', v_prize,
    'bonus_total', v_wallet.lucky_card_bonus_total
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- request_lucky_card_bonus_withdrawal: fixed 1,000 per request, idempotent while one is pending.
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
  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  -- already waiting for the admin (double click / lost connection / second tab): hand back the same request
  select id into v_existing from public.withdrawal_requests
  where user_id = p_user_id and source = 'lucky_card_bonus' and status = 'pending';
  if found then
    return jsonb_build_object('request_id', v_existing, 'amount_thb', 1000,
                              'bonus_total', v_wallet.lucky_card_bonus_total, 'already_pending', true);
  end if;

  if v_wallet.lucky_card_bonus_total < 1000 then raise exception 'BONUS_NOT_ENOUGH'; end if;

  insert into public.withdrawal_requests
    (user_id, amount_coins, amount_thb, bank_name, account_number, account_name, source)
  values
    (p_user_id, 1000, 1000, p_bank_name, p_account_number, p_account_name, 'lucky_card_bonus')
  returning id into v_req;

  return jsonb_build_object('request_id', v_req, 'amount_thb', 1000,
                            'bonus_total', v_wallet.lucky_card_bonus_total, 'already_pending', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- review_jackpot_withdrawal (replaces 0006): adds the 'lucky_card_bonus' source.
--   approve: counter -1,000 (main balance untouched);  reject/cancel: status only.
-- Lock order is request row -> wallet row (play/request only take the wallet row), so no deadlock.
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
    if v_req.source = 'lucky_card_bonus' then
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
  elsif v_req.source = 'jackpot' then
    select * into v_wallet from public.wallets where user_id = v_req.user_id for update;
    update public.wallets
    set balance = balance + v_req.amount_coins,
        jackpot_withdrawals_available = jackpot_withdrawals_available + 1
    where user_id = v_req.user_id;

    insert into public.wallet_ledger (user_id, reason, coins_delta, ref_id)
    values (v_req.user_id, 'withdrawal_refund', v_req.amount_coins, v_req.id);
  end if;
  -- 'lucky_card_bonus': nothing was deducted at request time, so cancelling only changes the status.

  update public.withdrawal_requests
  set status = 'rejected', reviewed_by = p_reviewer, reviewed_at = now()
  where id = p_request_id;
  return jsonb_build_object('status', 'rejected');
end;
$$;

revoke all on function public.play_lucky_card(uuid, integer, integer, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.request_lucky_card_bonus_withdrawal(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.review_jackpot_withdrawal(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.play_lucky_card(uuid, integer, integer, text, text, integer, integer) to service_role;
grant execute on function public.request_lucky_card_bonus_withdrawal(uuid, text, text, text) to service_role;
grant execute on function public.review_jackpot_withdrawal(uuid, boolean, text) to service_role;

notify pgrst, 'reload schema';
