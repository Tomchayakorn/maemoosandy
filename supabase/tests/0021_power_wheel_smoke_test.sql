-- Smoke test for migration 0021 (วงล้อไต่ชั้น). Run it in the Supabase SQL editor AFTER running 0021.
--
-- ONE DO block = one transaction that always ends with an exception on purpose, so EVERYTHING is rolled back (no coins, ledger rows or rounds kept).
--   * success -> the editor shows an "error" whose text starts with  ALL PASSED  followed by the PASS lines (this is the expected result)
--   * failure -> the error text starts with  FAIL:  and says which check broke
-- Needs at least one signed-up user (a wallet row). Danger slices: level 1 and 2 = {0}; level 3 and 4 = {0, 5}; slices 1 and 3 are safe on every level.

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
  update public.wallets set balance = 1000 where user_id = uid;

  -- 1. tables, payout and cap ------------------------------------------------------------------------
  if public.power_multiplier_bp(1) <> 10000 or public.power_multiplier_bp(2) <> 11111 or public.power_multiplier_bp(12) <> 2460474 then raise exception 'FAIL: multiplier table'; end if;
  if public.power_multiplier_bp(13) is not null or public.power_payout(100, 13) <> 0 or public.power_payout(100, 0) <> 0 then raise exception 'FAIL: impossible level must pay 0'; end if;
  if public.power_payout(10, 1) <> 10 or public.power_payout(100, 2) <> 111 or public.power_payout(100, 9) <> 1968 or public.power_payout(100, 10) <> 3000 or public.power_payout(100, 11) <> 3000 then raise exception 'FAIL: payout / cap'; end if;
  if not public.power_slice_is_danger(1, 0) or public.power_slice_is_danger(1, 1) then raise exception 'FAIL: danger slices level 1'; end if;
  -- level 2 still has ONE danger slice (0); the second one (5) only appears on level 3
  if not public.power_slice_is_danger(2, 0) or public.power_slice_is_danger(2, 5) then raise exception 'FAIL: danger slices level 2'; end if;
  if not public.power_slice_is_danger(3, 0) or not public.power_slice_is_danger(3, 5) or public.power_slice_is_danger(3, 2) then raise exception 'FAIL: danger slices level 3'; end if;
  msgs := msgs || E'\nPASS 1: multipliers, payout, 3,000 cap, danger slices';

  -- 2. start: validation, charge, one active round -----------------------------------------------------
  begin perform public.power_start(uid, 30); raise exception 'FAIL: bet 30 accepted';
  exception when others then if sqlerrm not like '%INVALID_BET%' then raise; end if; end;
  r := public.power_start(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  if (r ->> 'balance')::int <> 900 or (r ->> 'level')::int <> 0 then raise exception 'FAIL: bet not charged (%)', r; end if;
  if (select count(*) from public.wallet_ledger where ref_id = rid and reason = 'power_bet' and coins_delta = -100) <> 1 then raise exception 'FAIL: bet ledger row'; end if;
  begin perform public.power_start(uid, 10); raise exception 'FAIL: second active round allowed';
  exception when others then if sqlerrm not like '%ACTIVE_ROUND_EXISTS%' then raise; end if; end;
  begin perform public.power_stop(uid, rid); raise exception 'FAIL: stop with no level cleared';
  exception when others then if sqlerrm not like '%NO_LEVEL_CLEARED%' then raise; end if; end;
  begin perform public.power_spin(uid, rid, 10); raise exception 'FAIL: slice 10 accepted';
  exception when others then if sqlerrm not like '%INVALID_SLICE%' then raise; end if; end;
  msgs := msgs || E'\nPASS 2: validation, bet charged once, one active round, cannot stop at level 0 (balance 900)';

  -- 3. climb two levels and stop ---------------------------------------------------------------------------
  r := public.power_spin(uid, rid, 1);
  if r ->> 'status' <> 'active' or (r ->> 'level')::int <> 1 or (r ->> 'payout')::int <> 100 or (r ->> 'failed')::boolean then raise exception 'FAIL: level 1 (%)', r; end if;
  r := public.power_spin(uid, rid, 1);
  if (r ->> 'level')::int <> 2 or (r ->> 'payout')::int <> 111 then raise exception 'FAIL: level 2 (%)', r; end if;
  r := public.power_stop(uid, rid);
  if r ->> 'status' <> 'cashed' or (r ->> 'payout')::int <> 111 or (r ->> 'balance')::int <> 1011 then raise exception 'FAIL: stop (%)', r; end if;
  if (select count(*) from public.wallet_ledger where ref_id = rid and reason = 'power_win' and coins_delta = 111) <> 1 then raise exception 'FAIL: win ledger row'; end if;
  begin perform public.power_stop(uid, rid); raise exception 'FAIL: second stop paid';
  exception when others then if sqlerrm not like '%ROUND_NOT_ACTIVE%' then raise; end if; end;
  begin perform public.power_spin(uid, rid, 1); raise exception 'FAIL: spun a finished round';
  exception when others then if sqlerrm not like '%ROUND_NOT_ACTIVE%' then raise; end if; end;
  msgs := msgs || E'\nPASS 3: two levels, stop pays once, finished round is closed (balance 1011)';

  -- 4. a lost round (level 1 danger slice 0) ---------------------------------------------------------
  r := public.power_start(uid, 20);
  rid := (r ->> 'round_id')::uuid;
  r := public.power_spin(uid, rid, 0);
  if r ->> 'status' <> 'lost' or (r ->> 'payout')::int <> 0 or not (r ->> 'failed')::boolean or (r ->> 'balance')::int <> 991 then raise exception 'FAIL: lost round (%)', r; end if;
  if exists (select 1 from public.wallet_ledger where ref_id = rid and reason = 'power_win') then raise exception 'FAIL: a lost round paid'; end if;
  begin perform public.power_stop(uid, rid); raise exception 'FAIL: stop after a lost round';
  exception when others then if sqlerrm not like '%ROUND_NOT_ACTIVE%' then raise; end if; end;
  msgs := msgs || E'\nPASS 4: danger slice ends the round, no payout (balance 991)';

  -- 5. the cap: bet 100, clearing level 10 pays 3,000 by itself ------------------------------------------
  -- slice 3 is the 9th slice in the danger order, so it is safe on every level (at most 6 danger slices)
  r := public.power_start(uid, 100);
  rid := (r ->> 'round_id')::uuid;
  for n in 1..9 loop r := public.power_spin(uid, rid, 3); if (r ->> 'status') <> 'active' then raise exception 'FAIL: round ended early at level % (%)', n, r; end if; end loop;
  r := public.power_spin(uid, rid, 3);
  if r ->> 'status' <> 'cleared' or (r ->> 'payout')::int <> 3000 or r ->> 'auto' <> 'cap' or (r ->> 'balance')::int <> 991 - 100 + 3000 then raise exception 'FAIL: cap (%)', r; end if;
  msgs := msgs || E'\nPASS 5: reaching the cap pays 3,000 automatically (balance 3891)';

  -- 6. conservation: balance = 1000 + sum of this test's ledger rows ----------------------------------------
  select 1000 + coalesce(sum(coins_delta), 0) into n from public.wallet_ledger
   where user_id = uid and reason in ('power_bet', 'power_win') and ref_id in (select id from public.power_wheel_rounds where user_id = uid);
  if n <> (select balance from public.wallets where user_id = uid) then raise exception 'FAIL: ledger does not add up to the balance'; end if;
  msgs := msgs || E'\nPASS 6: ledger = balance';

  raise exception 'ALL PASSED%', msgs;
end;
$$;
