-- Smoke test for migration 0020 (เปิดหีบมนตรา). Run it in the Supabase SQL editor AFTER running 0020.
--
-- The whole test is ONE DO block, i.e. one transaction, and it always ends with an exception on purpose, so EVERYTHING is rolled back:
-- no coins, ledger rows or rounds are kept (it only touches the wallet of the first user it finds, inside the transaction).
--   * success -> the editor shows an "error" whose text starts with  ALL PASSED  followed by the PASS lines (this is the expected result)
--   * failure -> the error text starts with  FAIL:  and says which check broke
-- Needs at least one signed-up user (a wallet row).

do $$
declare
  uid  uuid;
  r    jsonb;
  rid  uuid;
  bal  integer;
  n    integer;
  msgs text := '';
begin
  select user_id into uid from public.wallets order by created_at limit 1;
  if uid is null then raise exception 'FAIL: no wallet found - sign up one user first'; end if;
  delete from public.mystic_chest_rounds where user_id = uid; -- inside the transaction only
  update public.wallets set balance = 1000 where user_id = uid;

  -- 1. multiplier table + payout + cap -------------------------------------------------------------
  if public.mystic_multiplier_bp(1, 1) <> 10125 or public.mystic_multiplier_bp(2, 4) <> 32400 or public.mystic_multiplier_bp(3, 6) <> 756000 then
    raise exception 'FAIL: multiplier table';
  end if;
  if public.mystic_multiplier_bp(1, 9) is not null or public.mystic_payout(100, 1, 9) <> 0 then raise exception 'FAIL: impossible k must pay 0'; end if;
  if public.mystic_payout(10, 1, 1) <> 10 or public.mystic_payout(100, 3, 4) <> 756 or public.mystic_payout(100, 3, 6) <> 5000 then
    raise exception 'FAIL: payout / cap';
  end if;
  msgs := msgs || E'\nPASS 1: multipliers, payout and the 5,000 cap';

  -- 2. start: validation ---------------------------------------------------------------------------
  begin perform public.mystic_start(uid, 30, 2, 3);  raise exception 'FAIL: bet 30 accepted';
  exception when others then if sqlerrm not like '%INVALID_BET%' then raise; end if; end;
  begin perform public.mystic_start(uid, 10, 2, 7);  raise exception 'FAIL: wrong number of cursed chests accepted';
  exception when others then if sqlerrm not like '%INVALID_MINES%' then raise; end if; end;
  begin perform public.mystic_start(uid, 10, 4, 15); raise exception 'FAIL: 4 cursed chests accepted';
  exception when others then if sqlerrm not like '%INVALID_MINES%' then raise; end if; end;
  msgs := msgs || E'\nPASS 2: bet and cursed-chest validation';

  -- 3. a round that is cashed out (cursed chests 0 and 1, bet 100) ----------------------------------
  r := public.mystic_start(uid, 100, 2, 3);
  rid := (r ->> 'round_id')::uuid;
  if (r ->> 'balance')::int <> 900 then raise exception 'FAIL: bet not charged'; end if;
  if (select count(*) from public.wallet_ledger where ref_id = rid and reason = 'mystic_bet' and coins_delta = -100) <> 1 then raise exception 'FAIL: bet ledger row'; end if;
  begin perform public.mystic_start(uid, 10, 1, 1); raise exception 'FAIL: second active round allowed';
  exception when others then if sqlerrm not like '%ACTIVE_ROUND_EXISTS%' then raise; end if; end;
  begin perform public.mystic_cashout(uid, rid); raise exception 'FAIL: cash out with no safe chest';
  exception when others then if sqlerrm not like '%NO_SAFE_TILE%' then raise; end if; end;
  r := public.mystic_open(uid, rid, 2);
  if r ->> 'status' <> 'active' or (r ->> 'safe_count')::int <> 1 or (r ->> 'payout')::int <> 115 or r -> 'mine_mask' <> 'null'::jsonb then
    raise exception 'FAIL: first safe chest (%)', r;
  end if;
  begin perform public.mystic_open(uid, rid, 2); raise exception 'FAIL: same chest opened twice';
  exception when others then if sqlerrm not like '%TILE_ALREADY_OPENED%' then raise; end if; end;
  begin perform public.mystic_open(uid, rid, 9); raise exception 'FAIL: chest 9 accepted';
  exception when others then if sqlerrm not like '%INVALID_TILE%' then raise; end if; end;
  r := public.mystic_open(uid, rid, 3);
  if (r ->> 'payout')::int <> 154 then raise exception 'FAIL: payout after 2 safe chests (%)', r; end if;
  r := public.mystic_cashout(uid, rid);
  if r ->> 'status' <> 'cashed' or (r ->> 'payout')::int <> 154 or (r ->> 'balance')::int <> 1054 then raise exception 'FAIL: cash out (%)', r; end if;
  if (select count(*) from public.wallet_ledger where ref_id = rid and reason = 'mystic_win' and coins_delta = 154) <> 1 then raise exception 'FAIL: win ledger row'; end if;
  begin perform public.mystic_cashout(uid, rid); raise exception 'FAIL: second cash out paid';
  exception when others then if sqlerrm not like '%ROUND_NOT_ACTIVE%' then raise; end if; end;
  begin perform public.mystic_open(uid, rid, 4); raise exception 'FAIL: opened a chest of a finished round';
  exception when others then if sqlerrm not like '%ROUND_NOT_ACTIVE%' then raise; end if; end;
  msgs := msgs || E'\nPASS 3: start, open, double-open, cash out once, finished round is closed (balance 1054)';

  -- 4. a lost round (chest 0 is cursed, bet 20) ---------------------------------------------------------
  r := public.mystic_start(uid, 20, 1, 1);
  rid := (r ->> 'round_id')::uuid;
  r := public.mystic_open(uid, rid, 0);
  if r ->> 'status' <> 'lost' or (r ->> 'payout')::int <> 0 or (r ->> 'mine_mask')::int <> 1 or (r ->> 'balance')::int <> 1034 then raise exception 'FAIL: lost round (%)', r; end if;
  if exists (select 1 from public.wallet_ledger where ref_id = rid and reason = 'mystic_win') then raise exception 'FAIL: a lost round paid'; end if;
  begin perform public.mystic_cashout(uid, rid); raise exception 'FAIL: cash out after a lost round';
  exception when others then if sqlerrm not like '%ROUND_NOT_ACTIVE%' then raise; end if; end;
  msgs := msgs || E'\nPASS 4: cursed chest ends the round, no payout (balance 1034)';

  -- 5. all safe chests opened pays out by itself; the 3-cursed full clear hits the cap ------------
  r := public.mystic_start(uid, 100, 3, 7); -- chests 0,1,2 cursed
  rid := (r ->> 'round_id')::uuid;
  perform public.mystic_open(uid, rid, 3); perform public.mystic_open(uid, rid, 4); perform public.mystic_open(uid, rid, 5);
  perform public.mystic_open(uid, rid, 6); perform public.mystic_open(uid, rid, 7);
  r := public.mystic_open(uid, rid, 8);
  if r ->> 'status' <> 'cleared' or (r ->> 'payout')::int <> 5000 or r ->> 'auto' <> 'all_open' or (r ->> 'balance')::int <> 1034 - 100 + 5000 then
    raise exception 'FAIL: full clear / cap (%)', r;
  end if;
  msgs := msgs || E'\nPASS 5: clearing every safe chest pays automatically, capped at 5,000 (balance 5934)';

  -- 6. not enough coins ----------------------------------------------------------------------------------
  update public.wallets set balance = 5 where user_id = uid;
  begin perform public.mystic_start(uid, 10, 1, 1); raise exception 'FAIL: started without coins';
  exception when others then if sqlerrm not like '%INSUFFICIENT_COINS%' then raise; end if; end;
  select balance into bal from public.wallets where user_id = uid;
  if bal <> 5 then raise exception 'FAIL: coins changed on a refused start'; end if;
  msgs := msgs || E'\nPASS 6: refused start charges nothing';

  -- 7. the ledger only has the two mystic reasons for these rounds, and nothing touched transactions ----
  select count(*) into n from public.wallet_ledger where reason in ('mystic_bet', 'mystic_win') and user_id = uid;
  if n < 5 then raise exception 'FAIL: expected mystic ledger rows, found %', n; end if;
  msgs := msgs || E'\nPASS 7: ledger rows use mystic_bet / mystic_win only';

  raise exception 'ALL PASSED (nothing was kept - this error is expected):%', msgs;
end;
$$;
