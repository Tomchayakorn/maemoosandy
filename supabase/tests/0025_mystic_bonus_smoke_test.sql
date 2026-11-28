-- Smoke test for migration 0025 (เปิดหีบมนตรา bonus x2/x5/x8). Run it in the Supabase SQL editor AFTER running 0025.
--
-- ONE DO block = one transaction that always ends with an exception on purpose, so EVERYTHING is rolled back (no coins, ledger rows or rounds kept).
--   * success -> the editor shows an "error" whose text starts with  ALL PASSED  followed by the PASS lines (this is the expected result)
--   * failure -> the error text starts with  FAIL:  and says which check broke
-- Needs at least one signed-up user (a wallet row). Cursed masks used: 1 = chest 0; 3 = chests 0,1; 7 = chests 0,1,2.

do $$
declare
  uid  uuid;
  r    jsonb;
  rid  uuid;
  n    integer;
  t    integer;
  msgs text := '';
begin
  select user_id into uid from public.wallets order by created_at limit 1;
  if uid is null then raise exception 'FAIL: no wallet found - sign up one user first'; end if;
  delete from public.mystic_chest_rounds where user_id = uid; -- inside the transaction only
  update public.wallets set balance = 5000 where user_id = uid;

  -- 1. odds, table, payouts ----------------------------------------------------------------------------
  if (select count(*) filter (where public.mystic_bonus_for_roll(g) = 8) from generate_series(0, 999) g) <> 10
     or (select count(*) filter (where public.mystic_bonus_for_roll(g) = 5) from generate_series(0, 999) g) <> 10
     or (select count(*) filter (where public.mystic_bonus_for_roll(g) = 2) from generate_series(0, 999) g) <> 10
     or (select count(*) filter (where public.mystic_bonus_for_roll(g) = 1) from generate_series(0, 999) g) <> 970 then raise exception 'FAIL: odds'; end if;
  if public.mystic_bonus_for_roll(-1) is not null or public.mystic_bonus_for_roll(1000) is not null or public.mystic_bonus_unlock_count() <> 3 then raise exception 'FAIL: roll range'; end if;
  if public.mystic_multiplier_bp_bonus(1, 2) <> 11571 or public.mystic_multiplier_bp_bonus(1, 3) <> 12053 or public.mystic_multiplier_bp_bonus(2, 7) <> 289285
     or public.mystic_multiplier_bp_bonus(3, 6) <> 675000 or public.mystic_multiplier_bp_bonus(3, 7) is not null then raise exception 'FAIL: bonus table'; end if;
  if public.mystic_round_payout(100, 1, 3, 2, null) <> 120 or public.mystic_round_payout(100, 1, 3, 2, 2) <> 241 or public.mystic_round_payout(100, 1, 3, 2, 5) <> 602
     or public.mystic_round_payout(100, 1, 3, 2, 8) <> 964 or public.mystic_round_payout(100, 3, 4, 2, 8) <> 5000 or public.mystic_round_payout(100, 3, 7, 2, 8) <> 0 then
    raise exception 'FAIL: bonus payout'; end if;
  if public.mystic_round_payout(100, 3, 3, 1, 8) <> 378 or public.mystic_multiplier_bp(1, 3) <> 13500 then raise exception 'FAIL: old rules changed'; end if;
  msgs := msgs || E'\nPASS 1: odds 970/10/10/10 per 1,000, table, payouts; old rules unchanged';

  -- 2. locked below the 3rd safe chest, unlocked once, mines hidden, paid once ------------------------------
  r := public.mystic_start_bonus(uid, 100, 1, 1);
  rid := (r ->> 'round_id')::uuid;
  if (r ->> 'balance')::int <> 4900 or (r ->> 'bonus_version')::int <> 2 or r ->> 'bonus' is not null or r ->> 'mine_mask' is not null then raise exception 'FAIL: start (%)', r; end if;
  begin perform public.mystic_start_bonus(uid, 10, 1, 1); raise exception 'FAIL: second active round';
  exception when others then if sqlerrm not like '%ACTIVE_ROUND_EXISTS%' then raise; end if; end;
  begin perform public.mystic_open_bonus(uid, rid, 1, 1000); raise exception 'FAIL: roll 1000 accepted';
  exception when others then if sqlerrm not like '%INVALID_REWARD%' then raise; end if; end;
  r := public.mystic_open_bonus(uid, rid, 1, 0);
  r := public.mystic_open_bonus(uid, rid, 2, 0);
  if r ->> 'bonus' is not null or (r ->> 'unlocked')::boolean or (r ->> 'payout')::int <> 115 then raise exception 'FAIL: unlocked too early (%)', r; end if;
  begin perform public.mystic_open_bonus(uid, rid, 2, 0); raise exception 'FAIL: same chest twice';
  exception when others then if sqlerrm not like '%TILE_ALREADY_OPENED%' then raise; end if; end;
  r := public.mystic_open_bonus(uid, rid, 3, 15);
  if (r ->> 'bonus')::int <> 5 or not (r ->> 'unlocked')::boolean or (r ->> 'payout')::int <> 602 or r ->> 'mine_mask' is not null then raise exception 'FAIL: unlock (%)', r; end if;
  r := public.mystic_open_bonus(uid, rid, 4, 0); -- a later roll must not change it
  if (r ->> 'bonus')::int <> 5 or (r ->> 'unlocked')::boolean or (r ->> 'payout')::int <> 723 then raise exception 'FAIL: bonus changed (%)', r; end if;
  r := public.mystic_cashout(uid, rid);
  if (r ->> 'payout')::int <> 723 or (r ->> 'balance')::int <> 5623 or (r ->> 'bonus')::int <> 5 or (r ->> 'mine_mask')::int <> 1 then raise exception 'FAIL: cash out (%)', r; end if;
  begin perform public.mystic_cashout(uid, rid); raise exception 'FAIL: second cash out paid';
  exception when others then if sqlerrm not like '%ROUND_NOT_ACTIVE%' then raise; end if; end;
  if (select count(*) from public.wallet_ledger where ref_id = rid and reason = 'mystic_win' and coins_delta = 723) <> 1 then raise exception 'FAIL: win ledger row'; end if;
  msgs := msgs || E'\nPASS 2: unlock on the 3rd safe chest, drawn once, paid once, mines hidden while active (balance 5623)';

  -- 3. no bonus, and a cursed chest after x8 ------------------------------------------------------------------
  r := public.mystic_start_bonus(uid, 100, 1, 1);
  rid := (r ->> 'round_id')::uuid;
  for t in 1..3 loop r := public.mystic_open_bonus(uid, rid, t, 30); end loop;
  if (r ->> 'bonus')::int <> 1 or (r ->> 'payout')::int <> 120 then raise exception 'FAIL: x1 (%)', r; end if;
  r := public.mystic_cashout(uid, rid);
  r := public.mystic_start_bonus(uid, 100, 1, 1);
  rid := (r ->> 'round_id')::uuid;
  for t in 1..3 loop r := public.mystic_open_bonus(uid, rid, t, 0); end loop;
  r := public.mystic_open_bonus(uid, rid, 0, 0);
  if r ->> 'status' <> 'lost' or (r ->> 'payout')::int <> 0 or (r ->> 'balance')::int <> 5543 then raise exception 'FAIL: cursed after bonus (%)', r; end if;
  if exists (select 1 from public.wallet_ledger where ref_id = rid and reason = 'mystic_win') then raise exception 'FAIL: a lost round paid'; end if;
  msgs := msgs || E'\nPASS 3: x1 pays 120, a cursed chest loses the round even with x8 (balance 5543)';

  -- 4. the cap, and clearing every safe chest -----------------------------------------------------------------
  r := public.mystic_start_bonus(uid, 100, 3, 7);
  rid := (r ->> 'round_id')::uuid;
  for t in 3..5 loop r := public.mystic_open_bonus(uid, rid, t, 0); end loop;
  if r ->> 'status' <> 'active' or (r ->> 'payout')::int <> 2700 then raise exception 'FAIL: before the cap (%)', r; end if;
  r := public.mystic_open_bonus(uid, rid, 6, 0);
  if r ->> 'status' <> 'cleared' or r ->> 'auto' <> 'cap' or (r ->> 'payout')::int <> 5000 or (r ->> 'balance')::int <> 10443 then raise exception 'FAIL: cap (%)', r; end if;
  r := public.mystic_start_bonus(uid, 10, 3, 7);
  rid := (r ->> 'round_id')::uuid;
  for t in 3..8 loop r := public.mystic_open_bonus(uid, rid, t, 999); end loop;
  if r ->> 'status' <> 'cleared' or r ->> 'auto' <> 'all_open' or (r ->> 'payout')::int <> 675 or (r ->> 'balance')::int <> 11108 then raise exception 'FAIL: all open (%)', r; end if;
  msgs := msgs || E'\nPASS 4: cap 5,000 paid automatically; clearing the board pays itself (balance 11108)';

  -- 5. a round started under the old rules (still running when 0025 arrived) keeps them ---------------------
  r := public.mystic_start(uid, 100, 2, 3);
  rid := (r ->> 'round_id')::uuid;
  r := public.mystic_open(uid, rid, 2);
  for t in 3..4 loop r := public.mystic_open_bonus(uid, rid, t, 0); end loop;
  if (r ->> 'bonus_version')::int <> 1 or r ->> 'bonus' is not null or (r ->> 'payout')::int <> 216 then raise exception 'FAIL: old round (%)', r; end if;
  r := public.mystic_cashout(uid, rid);
  if (r ->> 'payout')::int <> 216 or (r ->> 'balance')::int <> 11224 then raise exception 'FAIL: old cash out (%)', r; end if;
  msgs := msgs || E'\nPASS 5: a running old-rules round pays the old multipliers (balance 11224)';

  -- 6. a bonus round opened through the old function still follows the bonus rules --------------------------
  r := public.mystic_start_bonus(uid, 100, 1, 1);
  rid := (r ->> 'round_id')::uuid;
  for t in 1..3 loop r := public.mystic_open(uid, rid, t); end loop;
  if (r ->> 'bonus')::int not in (1, 2, 5, 8) or (r ->> 'payout')::int <> public.mystic_round_payout(100, 1, 3, 2, (r ->> 'bonus')::int) then raise exception 'FAIL: old function on a bonus round (%)', r; end if;
  r := public.mystic_cashout(uid, rid);
  msgs := msgs || E'\nPASS 6: the old function cannot strand a bonus round';

  -- 7. conservation: balance = 5000 + sum of this test's ledger rows --------------------------------------------
  select 5000 + coalesce(sum(coins_delta), 0) into n from public.wallet_ledger
   where user_id = uid and reason in ('mystic_bet', 'mystic_win') and ref_id in (select id from public.mystic_chest_rounds where user_id = uid);
  if n <> (select balance from public.wallets where user_id = uid) then raise exception 'FAIL: ledger does not add up to the balance'; end if;
  msgs := msgs || E'\nPASS 7: ledger = balance';

  raise exception '%', 'ALL PASSED (rolled back)' || msgs;
end;
$$;
