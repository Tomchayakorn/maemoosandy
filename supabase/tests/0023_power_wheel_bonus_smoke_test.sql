-- Smoke test for migration 0023 (วงล้อไต่ชั้น bonus x2/x5/x8). Run it in the Supabase SQL editor AFTER running 0023.
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

  -- 1. the odds and the tables ----------------------------------------------------------------------
  if (select count(*) filter (where public.power_bonus_for_roll(g) = 8) from generate_series(0, 999) g) <> 4
     or (select count(*) filter (where public.power_bonus_for_roll(g) = 5) from generate_series(0, 999) g) <> 10
     or (select count(*) filter (where public.power_bonus_for_roll(g) = 2) from generate_series(0, 999) g) <> 50
     or (select count(*) filter (where public.power_bonus_for_roll(g) = 1) from generate_series(0, 999) g) <> 936 then raise exception 'FAIL: odds'; end if;
  if public.power_bonus_for_roll(-1) is not null or public.power_bonus_for_roll(1000) is not null then raise exception 'FAIL: roll range'; end if;
  if public.power_bonus_unlock_level() <> 3 or public.power_multiplier_bp_bonus(1) <> 10000 or public.power_multiplier_bp_bonus(2) <> 11111
     or public.power_multiplier_bp_bonus(3) <> 12422 or public.power_multiplier_bp_bonus(12) <> 2200782 then raise exception 'FAIL: bonus table'; end if;
  if public.power_payout_bonus(100, 3, null) <> 124 or public.power_payout_bonus(100, 3, 2) <> 248 or public.power_payout_bonus(100, 3, 5) <> 621
     or public.power_payout_bonus(100, 3, 8) <> 993 or public.power_payout_bonus(100, 12, 8) <> 3000 or public.power_payout_bonus(100, 13, 8) <> 0 then
    raise exception 'FAIL: bonus payout'; end if;
  msgs := msgs || E'\nPASS 1: odds 936/50/10/4 per 1,000, table and payouts';

  -- 2. locked below level 3, unlocked once at level 3, stop pays once with the bonus -------------------
  r := public.power_start_bonus(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  if (r ->> 'balance')::int <> 4900 or (r ->> 'bonus_version')::int <> 2 or r ->> 'bonus' is not null then raise exception 'FAIL: start (%)', r; end if;
  begin perform public.power_spin_bonus(uid, rid, 1, 1000); raise exception 'FAIL: roll 1000 accepted';
  exception when others then if sqlerrm not like '%INVALID_REWARD%' then raise; end if; end;
  r := public.power_spin_bonus(uid, rid, 1, 0);
  r := public.power_spin_bonus(uid, rid, 1, 0);
  if r ->> 'bonus' is not null or (r ->> 'unlocked')::boolean or (r ->> 'payout')::int <> 111 then raise exception 'FAIL: unlocked too early (%)', r; end if;
  r := public.power_spin_bonus(uid, rid, 1, 5);
  if (r ->> 'bonus')::int <> 5 or not (r ->> 'unlocked')::boolean or (r ->> 'payout')::int <> 621 then raise exception 'FAIL: unlock (%)', r; end if;
  r := public.power_spin_bonus(uid, rid, 1, 0); -- a later roll must not change it
  if (r ->> 'bonus')::int <> 5 or (r ->> 'unlocked')::boolean or (r ->> 'payout')::int <> 776 then raise exception 'FAIL: bonus changed (%)', r; end if;
  r := public.power_stop(uid, rid);
  if (r ->> 'payout')::int <> 776 or (r ->> 'balance')::int <> 5676 or (r ->> 'bonus')::int <> 5 then raise exception 'FAIL: stop (%)', r; end if;
  begin perform public.power_stop(uid, rid); raise exception 'FAIL: second stop paid';
  exception when others then if sqlerrm not like '%ROUND_NOT_ACTIVE%' then raise; end if; end;
  if (select count(*) from public.wallet_ledger where ref_id = rid and reason = 'power_win' and coins_delta = 776) <> 1 then raise exception 'FAIL: win ledger row'; end if;
  msgs := msgs || E'\nPASS 2: unlock at level 3 only, drawn once, paid once (balance 5676)';

  -- 3. no bonus (x1), then a danger slice after an unlocked bonus ---------------------------------------
  r := public.power_start_bonus(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  for n in 1..3 loop r := public.power_spin_bonus(uid, rid, 1, 999); end loop;
  if (r ->> 'bonus')::int <> 1 or (r ->> 'payout')::int <> 124 then raise exception 'FAIL: x1 (%)', r; end if;
  r := public.power_stop(uid, rid);
  r := public.power_start_bonus(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  for n in 1..3 loop r := public.power_spin_bonus(uid, rid, 1, 0); end loop;
  r := public.power_spin_bonus(uid, rid, 0, 0);
  if r ->> 'status' <> 'lost' or (r ->> 'payout')::int <> 0 or (r ->> 'balance')::int <> 5600 then raise exception 'FAIL: lost with bonus (%)', r; end if;
  if exists (select 1 from public.wallet_ledger where ref_id = rid and reason = 'power_win') then raise exception 'FAIL: a lost round paid'; end if;
  msgs := msgs || E'\nPASS 3: x1 pays the base table, a danger slice loses the round even with x8 (balance 5600)';

  -- 4. x8 with bet 100 reaches the 3,000 cap at level 7 and pays by itself ------------------------------
  r := public.power_start_bonus(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  for n in 1..6 loop r := public.power_spin_bonus(uid, rid, 1, 0); if r ->> 'status' <> 'active' then raise exception 'FAIL: ended early at % (%)', n, r; end if; end loop;
  r := public.power_spin_bonus(uid, rid, 1, 0);
  if r ->> 'status' <> 'cleared' or r ->> 'auto' <> 'cap' or (r ->> 'payout')::int <> 3000 or (r ->> 'balance')::int <> 8500 then raise exception 'FAIL: cap (%)', r; end if;
  msgs := msgs || E'\nPASS 4: cap still 3,000, paid automatically (balance 8500)';

  -- 5. a round started under the old rules keeps them ----------------------------------------------------
  r := public.power_start(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  for n in 1..3 loop r := public.power_spin_bonus(uid, rid, 1, 0); end loop;
  if (r ->> 'bonus_version')::int <> 1 or r ->> 'bonus' is not null or (r ->> 'payout')::int <> 138 then raise exception 'FAIL: old round (%)', r; end if;
  r := public.power_stop(uid, rid);
  if (r ->> 'payout')::int <> 138 or (r ->> 'balance')::int <> 8538 then raise exception 'FAIL: old stop (%)', r; end if;
  msgs := msgs || E'\nPASS 5: old-rule rounds still pay the old table (balance 8538)';

  -- 6. a bonus round spun through the old function still follows the bonus rules ------------------------
  r := public.power_start_bonus(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  for n in 1..3 loop r := public.power_spin(uid, rid, 1); end loop;
  if (r ->> 'bonus')::int not in (1, 2, 5, 8) or (r ->> 'payout')::int <> public.power_payout_bonus(100, 3, (r ->> 'bonus')::int) then raise exception 'FAIL: old function on a bonus round (%)', r; end if;
  r := public.power_stop(uid, rid);
  msgs := msgs || E'\nPASS 6: the old function cannot strand a bonus round';

  -- 7. conservation: balance = 5000 + sum of this test's ledger rows --------------------------------------
  select 5000 + coalesce(sum(coins_delta), 0) into n from public.wallet_ledger
   where user_id = uid and reason in ('power_bet', 'power_win') and ref_id in (select id from public.power_wheel_rounds where user_id = uid);
  if n <> (select balance from public.wallets where user_id = uid) then raise exception 'FAIL: ledger does not add up to the balance'; end if;
  msgs := msgs || E'\nPASS 7: ledger = balance';

  raise exception '%', 'ALL PASSED (rolled back)' || msgs;
end;
$$;
