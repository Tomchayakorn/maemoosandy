-- Smoke test for migration 0022 (จับคู่ภาพเหมือน). Run it in the Supabase SQL editor AFTER running 0022.
--
-- ONE DO block = one transaction that always ends with an exception on purpose, so EVERYTHING is rolled back (no coins, ledger rows or rounds kept).
--   * success -> the editor shows an "error" whose text starts with  ALL PASSED  followed by the PASS lines (this is the expected result)
--   * failure -> the error text starts with  FAIL:  and says which check broke
-- Needs at least one signed-up user (a wallet row). Test layout: cards 0+1, 2+3, 4+5, 6+7, 8+9, 10+11 are the pairs.

do $$
declare
  uid  uuid;
  r    jsonb;
  rid  uuid;
  lay  integer[] := array[0,0,1,1,2,2,3,3,4,4,5,5];
  i    integer;
  n    integer;
  msgs text := '';
begin
  select user_id into uid from public.wallets order by created_at limit 1;
  if uid is null then raise exception 'FAIL: no wallet found - sign up one user first'; end if;
  delete from public.match_game_rounds where user_id = uid; -- inside the transaction only
  update public.wallets set balance = 1000 where user_id = uid;

  -- 1. constants and layout validation ------------------------------------------------------------------
  if public.match_cost() <> 20 or public.match_max_turns() <> 12 or public.match_pair_reward() <> 5
     or public.match_clear_bonus() <> 15 or public.match_daily_rounds() <> 3 then raise exception 'FAIL: constants'; end if;
  begin perform public.match_start(uid, array[0,0,0,0,1,1,2,2,3,3,4,4]); raise exception 'FAIL: bad layout accepted';
  exception when others then if sqlerrm not like '%INVALID_LAYOUT%' then raise; end if; end;
  begin perform public.match_start(uid, array[0,0,1,1]); raise exception 'FAIL: short layout accepted';
  exception when others then if sqlerrm not like '%INVALID_LAYOUT%' then raise; end if; end;
  msgs := msgs || E'\nPASS 1: constants and layout validation';

  -- 2. start: charged once, hidden layout, one active round -----------------------------------------------
  r := public.match_start(uid, lay);
  rid := (r ->> 'round_id')::uuid;
  if (r ->> 'balance')::int <> 980 or r ->> 'layout' is not null or jsonb_array_length(r -> 'matched') <> 0 or (r ->> 'rounds_today')::int <> 1 then
    raise exception 'FAIL: start (%)', r; end if;
  if (select count(*) from public.wallet_ledger where ref_id = rid and reason = 'match_bet' and coins_delta = -20) <> 1 then raise exception 'FAIL: bet ledger row'; end if;
  begin perform public.match_start(uid, lay); raise exception 'FAIL: second active round allowed';
  exception when others then if sqlerrm not like '%ACTIVE_ROUND_EXISTS%' then raise; end if; end;
  msgs := msgs || E'\nPASS 2: 20 coins charged once, layout hidden, one active round (balance 980)';

  -- 3. flips: step guard, same card, a miss, a match --------------------------------------------------------
  r := public.match_flip(uid, rid, 0, 0);
  if (r -> 'flip' ->> 'second')::boolean or (r ->> 'step')::int <> 1 or r ->> 'layout' is not null then raise exception 'FAIL: first card (%)', r; end if;
  begin perform public.match_flip(uid, rid, 0, 0); raise exception 'FAIL: repeated request applied';
  exception when others then if sqlerrm not like '%STALE_ROUND_STATE%' then raise; end if; end;
  begin perform public.match_flip(uid, rid, 0, 1); raise exception 'FAIL: same card twice';
  exception when others then if sqlerrm not like '%CARD_ALREADY_OPEN%' then raise; end if; end;
  begin perform public.match_flip(uid, rid, 12, 1); raise exception 'FAIL: card 12 accepted';
  exception when others then if sqlerrm not like '%INVALID_CARD%' then raise; end if; end;
  r := public.match_flip(uid, rid, 2, 1);
  if (r -> 'flip' ->> 'match')::boolean or (r ->> 'turns_used')::int <> 1 or (r ->> 'balance')::int <> 980 then raise exception 'FAIL: miss (%)', r; end if;
  r := public.match_flip(uid, rid, 0, 2);
  r := public.match_flip(uid, rid, 1, 3);
  if not (r -> 'flip' ->> 'match')::boolean or (r ->> 'pairs')::int <> 1 or (r ->> 'balance')::int <> 985 or jsonb_array_length(r -> 'matched') <> 2 then
    raise exception 'FAIL: match (%)', r; end if;
  begin perform public.match_flip(uid, rid, 1, 4); raise exception 'FAIL: matched card opened again';
  exception when others then if sqlerrm not like '%CARD_ALREADY_MATCHED%' then raise; end if; end;
  msgs := msgs || E'\nPASS 3: step guard, same/matched card refused, miss pays nothing, pair pays 5 (balance 985)';

  -- 4. clear the board: bonus once, layout revealed, round closed ----------------------------------------
  for i in 1..5 loop
    r := public.match_flip(uid, rid, i * 2, 2 + 2 * i);
    r := public.match_flip(uid, rid, i * 2 + 1, 3 + 2 * i);
  end loop;
  if r ->> 'status' <> 'finished' or (r ->> 'pairs')::int <> 6 or (r ->> 'payout')::int <> 45 or (r ->> 'balance')::int <> 1025
     or (r -> 'flip' ->> 'bonus')::int <> 15 or jsonb_array_length(r -> 'layout') <> 12 then raise exception 'FAIL: clear (%)', r; end if;
  if (select count(*) from public.wallet_ledger where ref_id = rid and reason = 'match_win') <> 6
     or (select count(*) from public.wallet_ledger where ref_id = rid and reason = 'match_bonus' and coins_delta = 15) <> 1 then raise exception 'FAIL: win ledger rows'; end if;
  begin perform public.match_flip(uid, rid, 0, 14); raise exception 'FAIL: flip on a finished round';
  exception when others then if sqlerrm not like '%ROUND_NOT_ACTIVE%' then raise; end if; end;
  msgs := msgs || E'\nPASS 4: board cleared pays 45 once, layout shown only now (balance 1025)';

  -- 5. turns run out after 12 --------------------------------------------------------------------------------
  r := public.match_start(uid, lay);
  rid := (r ->> 'round_id')::uuid;
  for i in 0..11 loop
    r := public.match_flip(uid, rid, 0, i * 2);
    r := public.match_flip(uid, rid, 2, i * 2 + 1);
  end loop;
  if r ->> 'status' <> 'finished' or (r ->> 'turns_used')::int <> 12 or (r ->> 'payout')::int <> 0 or (r ->> 'balance')::int <> 1005 then raise exception 'FAIL: turn limit (%)', r; end if;
  msgs := msgs || E'\nPASS 5: the 12th turn ends the round (balance 1005)';

  -- 6. three rounds a day --------------------------------------------------------------------------------------
  r := public.match_start(uid, lay);
  rid := (r ->> 'round_id')::uuid;
  if (r ->> 'rounds_today')::int <> 3 then raise exception 'FAIL: third round (%)', r; end if;
  for i in 0..11 loop
    r := public.match_flip(uid, rid, 0, i * 2);
    r := public.match_flip(uid, rid, 2, i * 2 + 1);
  end loop;
  begin perform public.match_start(uid, lay); raise exception 'FAIL: a fourth round today';
  exception when others then if sqlerrm not like '%DAILY_LIMIT_REACHED%' then raise; end if; end;
  update public.match_game_rounds set play_date = play_date - 1 where user_id = uid; -- as if they were yesterday
  update public.wallets set balance = 19 where user_id = uid;
  begin perform public.match_start(uid, lay); raise exception 'FAIL: started with 19 coins';
  exception when others then if sqlerrm not like '%INSUFFICIENT_COINS%' then raise; end if; end;
  update public.wallets set balance = 985 where user_id = uid;
  r := public.match_start(uid, lay);
  if (r ->> 'rounds_today')::int <> 1 or (r ->> 'balance')::int <> 965 then raise exception 'FAIL: new day (%)', r; end if;
  msgs := msgs || E'\nPASS 6: three rounds a day, the next day starts again, 20 coins required';

  -- 7. conservation --------------------------------------------------------------------------------------------
  select coalesce(sum(coins_delta), 0) into n from public.wallet_ledger
   where user_id = uid and ref_id in (select id from public.match_game_rounds where user_id = uid);
  if n <> -20 * 4 + 45 then raise exception 'FAIL: ledger sum %', n; end if;
  msgs := msgs || E'\nPASS 7: ledger rows add up (4 bets, one cleared board)';

  raise exception '%', 'ALL PASSED (rolled back)' || msgs;
end;
$$;
