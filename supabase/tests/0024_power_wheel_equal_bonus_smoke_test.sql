-- Smoke test for migration 0024 (วงล้อไต่ชั้น equal bonus odds, rules version 3). Run it in the Supabase SQL editor AFTER running 0024.
--
-- ONE DO block = one transaction that always ends with an exception on purpose, so EVERYTHING is rolled back (no coins, ledger rows or rounds kept).
--   * success -> the editor shows an "error" whose text starts with  ALL PASSED  followed by the PASS lines (this is the expected result)
--   * failure -> the error text starts with  FAIL:  and says which check broke
-- Needs at least one signed-up user (a wallet row). Slice 1 is safe on every level; slice 0 is a danger slice on every level.

do $$
declare
  uid  uuid;
  r    jsonb;
  rid  uuid;
  n    integer;
  msgs text := '';
begin
  select user_id into uid from public.wallets order by created_at limit 1;
  if uid is null then raise exception 'FAIL: no wallet found - sign up one user first'; end if;
  delete from public.power_wheel_rounds where user_id = uid; -- inside the transaction only
  update public.wallets set balance = 5000 where user_id = uid;

  -- 1. equal odds, the table, payouts ------------------------------------------------------------------
  if (select count(*) filter (where public.power_bonus_for_roll_v3(g) = 8) from generate_series(0, 999) g) <> 10
     or (select count(*) filter (where public.power_bonus_for_roll_v3(g) = 5) from generate_series(0, 999) g) <> 10
     or (select count(*) filter (where public.power_bonus_for_roll_v3(g) = 2) from generate_series(0, 999) g) <> 10
     or (select count(*) filter (where public.power_bonus_for_roll_v3(g) = 1) from generate_series(0, 999) g) <> 970 then raise exception 'FAIL: odds'; end if;
  if public.power_bonus_for_roll_v3(-1) is not null or public.power_bonus_for_roll_v3(1000) is not null then raise exception 'FAIL: roll range'; end if;
  if public.power_multiplier_bp_v3(2) <> 11111 or public.power_multiplier_bp_v3(3) <> 12400 or public.power_multiplier_bp_v3(12) <> 2196852 then raise exception 'FAIL: table'; end if;
  if public.power_round_payout(100, 3, 3, null) <> 124 or public.power_round_payout(100, 3, 3, 2) <> 248 or public.power_round_payout(100, 3, 3, 5) <> 620
     or public.power_round_payout(100, 3, 3, 8) <> 992 or public.power_round_payout(100, 12, 3, 8) <> 3000 or public.power_round_payout(100, 13, 3, 8) <> 0 then
    raise exception 'FAIL: payout v3'; end if;
  -- the older versions are unchanged
  if public.power_round_payout(100, 3, 2, 8) <> 993 or public.power_round_payout(100, 3, 1, 8) <> 138 or public.power_bonus_for_roll(4) <> 5 then raise exception 'FAIL: older versions changed'; end if;
  msgs := msgs || E'\nPASS 1: x2 / x5 / x8 10 per 1,000 each, table and payouts; older versions unchanged';

  -- 2. unlock once at level 3, paid once -----------------------------------------------------------------
  r := public.power_start_bonus_v3(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  if (r ->> 'balance')::int <> 4900 or (r ->> 'bonus_version')::int <> 3 or r ->> 'bonus' is not null then raise exception 'FAIL: start (%)', r; end if;
  r := public.power_spin_bonus(uid, rid, 1, 0);
  r := public.power_spin_bonus(uid, rid, 1, 0);
  if r ->> 'bonus' is not null or (r ->> 'payout')::int <> 111 then raise exception 'FAIL: unlocked too early (%)', r; end if;
  r := public.power_spin_bonus(uid, rid, 1, 10);
  if (r ->> 'bonus')::int <> 5 or not (r ->> 'unlocked')::boolean or (r ->> 'payout')::int <> 620 or (r ->> 'bonus_version')::int <> 3 then raise exception 'FAIL: unlock (%)', r; end if;
  r := public.power_spin_bonus(uid, rid, 1, 0); -- a later roll must not change it
  if (r ->> 'bonus')::int <> 5 or (r ->> 'unlocked')::boolean or (r ->> 'payout')::int <> 775 then raise exception 'FAIL: bonus changed (%)', r; end if;
  r := public.power_stop(uid, rid);
  if (r ->> 'payout')::int <> 775 or (r ->> 'balance')::int <> 5675 then raise exception 'FAIL: stop (%)', r; end if;
  begin perform public.power_stop(uid, rid); raise exception 'FAIL: second stop paid';
  exception when others then if sqlerrm not like '%ROUND_NOT_ACTIVE%' then raise; end if; end;
  msgs := msgs || E'\nPASS 2: unlock at level 3, drawn once, paid once (balance 5675)';

  -- 3. no bonus, and a danger slice after x8 ----------------------------------------------------------------
  r := public.power_start_bonus_v3(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  for n in 1..3 loop r := public.power_spin_bonus(uid, rid, 1, 30); end loop;
  if (r ->> 'bonus')::int <> 1 or (r ->> 'payout')::int <> 124 then raise exception 'FAIL: x1 (%)', r; end if;
  r := public.power_stop(uid, rid);
  r := public.power_start_bonus_v3(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  for n in 1..3 loop r := public.power_spin_bonus(uid, rid, 1, 9); end loop;
  if (r ->> 'bonus')::int <> 8 then raise exception 'FAIL: x8 (%)', r; end if;
  r := public.power_spin_bonus(uid, rid, 0, 0);
  if r ->> 'status' <> 'lost' or (r ->> 'balance')::int <> 5599 then raise exception 'FAIL: lost with bonus (%)', r; end if;
  msgs := msgs || E'\nPASS 3: x1 pays 124, a danger slice loses the round even with x8 (balance 5599)';

  -- 4. the cap --------------------------------------------------------------------------------------------------
  r := public.power_start_bonus_v3(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  for n in 1..7 loop r := public.power_spin_bonus(uid, rid, 1, 0); end loop;
  if r ->> 'status' <> 'cleared' or r ->> 'auto' <> 'cap' or (r ->> 'payout')::int <> 3000 or (r ->> 'balance')::int <> 8499 then raise exception 'FAIL: cap (%)', r; end if;
  msgs := msgs || E'\nPASS 4: cap still 3,000, paid automatically (balance 8499)';

  -- 5. a version 2 round (0023) keeps its own odds and table: roll 14 is x2 there (x5 in version 3) -----------
  r := public.power_start_bonus(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  for n in 1..3 loop r := public.power_spin_bonus(uid, rid, 1, 14); end loop;
  if (r ->> 'bonus_version')::int <> 2 or (r ->> 'bonus')::int <> 2 or (r ->> 'payout')::int <> 248 then raise exception 'FAIL: version 2 round (%)', r; end if;
  r := public.power_spin_bonus(uid, rid, 1, 0);
  if (r ->> 'payout')::int <> 310 then raise exception 'FAIL: version 2 table (%)', r; end if;
  r := public.power_stop(uid, rid);
  msgs := msgs || E'\nPASS 5: rounds of version 2 keep their odds and table';

  -- 6. a version 1 round, and the old spin function on a version 3 round --------------------------------------
  r := public.power_start(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  for n in 1..3 loop r := public.power_spin_bonus(uid, rid, 1, 0); end loop;
  if (r ->> 'payout')::int <> 138 or r ->> 'bonus' is not null then raise exception 'FAIL: version 1 round (%)', r; end if;
  r := public.power_stop(uid, rid);
  r := public.power_start_bonus_v3(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  for n in 1..3 loop r := public.power_spin(uid, rid, 1); end loop;
  if (r ->> 'bonus_version')::int <> 3 or (r ->> 'payout')::int <> public.power_round_payout(100, 3, 3, (r ->> 'bonus')::int) then raise exception 'FAIL: old function on a version 3 round (%)', r; end if;
  r := public.power_stop(uid, rid);
  msgs := msgs || E'\nPASS 6: version 1 pays 138; the old function cannot strand a version 3 round';

  -- 7. conservation ----------------------------------------------------------------------------------------------
  select 5000 + coalesce(sum(coins_delta), 0) into n from public.wallet_ledger
   where user_id = uid and reason in ('power_bet', 'power_win') and ref_id in (select id from public.power_wheel_rounds where user_id = uid);
  if n <> (select balance from public.wallets where user_id = uid) then raise exception 'FAIL: ledger does not add up to the balance'; end if;
  msgs := msgs || E'\nPASS 7: ledger = balance';

  raise exception '%', 'ALL PASSED (rolled back)' || msgs;
end;
$$;
