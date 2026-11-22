-- Daily income / expense summary pushed to the admin's LINE after midnight (Bangkok time).
--   * public.daily_finance_summaries: ONE row per Bangkok date = the guard against sending the same day's summary twice.
--   * claim_daily_summary(date): atomically claims a date. Returns true only for the caller that should send:
--       - no row yet                          -> inserted as 'sending', true
--       - row is 'failed' (LINE push failed)  -> re-claimed, true (a retry is allowed)
--       - row is 'sending' for > 15 minutes   -> re-claimed, true (the earlier run crashed)
--       - row is 'sent' (or 'sending' < 15 m) -> false (never a duplicate)
--   * finish_daily_summary(...): records the outcome ('sent' / 'failed') and the figures that were sent.
--   * The table has RLS enabled with NO policy and both functions are service_role only (called by /api/cron/daily-summary).
-- Run once in the Supabase SQL editor (any time; independent of the other migrations). Safe to run again.

create table if not exists public.daily_finance_summaries (
  summary_date  date primary key,
  status        text not null check (status in ('sending', 'sent', 'failed')),
  income_thb    numeric(14, 2),
  income_count  integer,
  expense_thb   numeric(14, 2),
  expense_count integer,
  claimed_at    timestamptz not null default now(),
  sent_at       timestamptz,
  error         text
);

alter table public.daily_finance_summaries enable row level security;
revoke all on public.daily_finance_summaries from anon, authenticated;

create or replace function public.claim_daily_summary(p_date date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date;
begin
  insert into public.daily_finance_summaries as s (summary_date, status, claimed_at)
  values (p_date, 'sending', now())
  on conflict (summary_date) do update
    set status = 'sending', claimed_at = now(), error = null
    where s.status = 'failed'
       or (s.status = 'sending' and s.claimed_at < now() - interval '15 minutes')
  returning s.summary_date into v_date;
  return v_date is not null;
end;
$$;

create or replace function public.finish_daily_summary(
  p_date          date,
  p_ok            boolean,
  p_income_thb    numeric,
  p_income_count  integer,
  p_expense_thb   numeric,
  p_expense_count integer,
  p_error         text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.daily_finance_summaries
  set status = case when p_ok then 'sent' else 'failed' end,
      income_thb = p_income_thb,
      income_count = p_income_count,
      expense_thb = p_expense_thb,
      expense_count = p_expense_count,
      sent_at = case when p_ok then now() else null end,
      error = case when p_ok then null else left(p_error, 300) end
  where summary_date = p_date;
end;
$$;

revoke all on function public.claim_daily_summary(date) from public, anon, authenticated;
revoke all on function public.finish_daily_summary(date, boolean, numeric, integer, numeric, integer, text) from public, anon, authenticated;
grant execute on function public.claim_daily_summary(date) to service_role;
grant execute on function public.finish_daily_summary(date, boolean, numeric, integer, numeric, integer, text) to service_role;

notify pgrst, 'reload schema';
