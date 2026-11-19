-- "ดวงดี มีเฮ" (lucky card game): 20 coins per play, flip 1 of 8 cards.
--  * play_lucky_card: atomic charge + bonus credit + secret-prize entitlement + play log.
--  * lucky_card_prizes: cash prize ("เทพประทานทรัพย์") entitlements; NOT credited as coins, withdrawn in THB (1,000 coins = 1,000 THB).
--  * withdrawal_requests is extended (amount no longer fixed at 5,000; `source` + `prize_id`).
--  * request_lucky_card_withdrawal: locks the prize, flips it to 'withdrawn', creates the pending request (no double withdrawal).
--  * review_jackpot_withdrawal: reject of a lucky-card request restores the prize to 'pending' (no coin refund).
-- Run once in the Supabase SQL editor AFTER 0005. All RPCs are service_role only.

-- Ledger reasons
alter table public.wallet_ledger drop constraint if exists wallet_ledger_reason_check;
alter table public.wallet_ledger add constraint wallet_ledger_reason_check
  check (reason in ('tarot', 'birthdate', 'topup', 'spin', 'checkin', 'refund', 'admin',
                    'withdrawal', 'withdrawal_refund', 'luckycard', 'luckycard_bonus'));

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table if not exists public.lucky_card_plays (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  card_index   smallint not null check (card_index between 0 and 7),
  result_kind  text not null check (result_kind in ('message', 'bonus', 'secret')),
  message_id   text,
  bonus_coins  integer not null default 0 check (bonus_coins >= 0),
  prize_id     uuid,
  created_at   timestamptz not null default now()
);
create index if not exists lucky_card_plays_user_idx on public.lucky_card_plays (user_id, created_at desc);

create table if not exists public.lucky_card_prizes (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  play_id               uuid references public.lucky_card_plays (id),
  amount_thb            integer not null check (amount_thb > 0),
  status                text not null default 'pending' check (status in ('pending', 'withdrawn')),
  withdrawal_request_id uuid,
  created_at            timestamptz not null default now()
);
create index if not exists lucky_card_prizes_user_idx on public.lucky_card_prizes (user_id, status, created_at desc);
create unique index if not exists lucky_card_prizes_request_uidx
  on public.lucky_card_prizes (withdrawal_request_id) where withdrawal_request_id is not null;

alter table public.lucky_card_plays enable row level security;
alter table public.lucky_card_prizes enable row level security;
drop policy if exists "lucky_card_plays: read own" on public.lucky_card_plays;
create policy "lucky_card_plays: read own" on public.lucky_card_plays
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "lucky_card_prizes: read own" on public.lucky_card_prizes;
create policy "lucky_card_prizes: read own" on public.lucky_card_prizes
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete, truncate on public.lucky_card_plays from anon, authenticated;
revoke insert, update, delete, truncate on public.lucky_card_prizes from anon, authenticated;
revoke all on public.lucky_card_plays from anon;
revoke all on public.lucky_card_prizes from anon;

-- withdrawal_requests: variable amount (1 coin = 1 THB), where the request came from
alter table public.withdrawal_requests drop constraint if exists withdrawal_requests_amount_coins_check;
alter table public.withdrawal_requests drop constraint if exists withdrawal_requests_amount_thb_check;
alter table public.withdrawal_requests alter column amount_coins drop default;
alter table public.withdrawal_requests alter column amount_thb drop default;
alter table public.withdrawal_requests add constraint withdrawal_requests_amount_check
  check (amount_coins > 0 and amount_thb = amount_coins);
alter table public.withdrawal_requests add column if not exists source text not null default 'jackpot'
  check (source in ('jackpot', 'lucky_card'));
alter table public.withdrawal_requests add column if not exists prize_id uuid references public.lucky_card_prizes (id);
-- existing rows keep amount 5000/5000; new jackpot inserts must now state the amount (done below)

-- request_jackpot_withdrawal: same as 0005 but states the amount explicitly (default was dropped)
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

  insert into public.withdrawal_requests (user_id, amount_coins, amount_thb, bank_name, account_number, account_name, ledger_id, source)
  values (p_user_id, 5000, 5000, p_bank_name, p_account_number, p_account_name, v_ledger, 'jackpot')
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
-- play_lucky_card
-- The route draws the outcome (crypto) and passes it in; this function only applies it atomically.
-- p_kind: 'message' | 'bonus' | 'secret'.  Bonus coins are validated against a fixed whitelist.
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

  update public.wallets set balance = balance - p_cost + v_bonus
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

  return jsonb_build_object('play_id', v_play, 'balance', v_wallet.balance, 'prize_id', v_prize);
end;
$$;

-- -----------------------------------------------------------------------------
-- request_lucky_card_withdrawal: prize must be the user's and still 'pending'.
-- -----------------------------------------------------------------------------
create or replace function public.request_lucky_card_withdrawal(
  p_user_id        uuid,
  p_prize_id       uuid,
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
  v_prize public.lucky_card_prizes%rowtype;
  v_req   uuid;
begin
  select * into v_prize from public.lucky_card_prizes
  where id = p_prize_id and user_id = p_user_id for update;
  if not found then raise exception 'PRIZE_NOT_FOUND'; end if;
  if v_prize.status <> 'pending' then raise exception 'PRIZE_ALREADY_WITHDRAWN'; end if;

  insert into public.withdrawal_requests
    (user_id, amount_coins, amount_thb, bank_name, account_number, account_name, source, prize_id)
  values
    (p_user_id, v_prize.amount_thb, v_prize.amount_thb, p_bank_name, p_account_number, p_account_name, 'lucky_card', v_prize.id)
  returning id into v_req;

  update public.lucky_card_prizes set status = 'withdrawn', withdrawal_request_id = v_req where id = v_prize.id;

  return jsonb_build_object('request_id', v_req, 'amount_thb', v_prize.amount_thb);
end;
$$;

-- -----------------------------------------------------------------------------
-- review_jackpot_withdrawal: lucky-card requests restore the prize on reject (no coins involved).
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
    update public.withdrawal_requests
    set status = 'approved', reviewed_by = p_reviewer, reviewed_at = now()
    where id = p_request_id;
    return jsonb_build_object('status', 'approved');
  end if;

  if v_req.source = 'lucky_card' then
    update public.lucky_card_prizes set status = 'pending', withdrawal_request_id = null where id = v_req.prize_id;
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
  set status = 'rejected', reviewed_by = p_reviewer, reviewed_at = now()
  where id = p_request_id;
  return jsonb_build_object('status', 'rejected');
end;
$$;

revoke all on function public.request_jackpot_withdrawal(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.play_lucky_card(uuid, integer, integer, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.request_lucky_card_withdrawal(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.review_jackpot_withdrawal(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.request_jackpot_withdrawal(uuid, text, text, text) to service_role;
grant execute on function public.play_lucky_card(uuid, integer, integer, text, text, integer, integer) to service_role;
grant execute on function public.request_lucky_card_withdrawal(uuid, uuid, text, text, text) to service_role;
grant execute on function public.review_jackpot_withdrawal(uuid, boolean, text) to service_role;

notify pgrst, 'reload schema';
