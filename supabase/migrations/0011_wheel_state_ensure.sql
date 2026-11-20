-- Make sure the wheel's global paid-spin counter exists.
-- Why: spin_wheel_cycle (0004/0005/0010) increments public.wheel_state on every PAID spin. If that table is missing the function
-- fails with 42P01 and the app silently falls back to the no-RPC path (spin-direct.ts), which has no luck-card / buff support and
-- leaves spin_logs.paid_spin_number empty. Every spin log in the live database has a NULL paid_spin_number, i.e. the RPC never ran.
-- This file only CREATES what is missing; it never changes an existing counter, so it is safe to run any number of times.
-- Run in the Supabase SQL editor (any time after 0010).

create table if not exists public.wheel_state (
  id              integer primary key check (id = 1),
  paid_spin_count bigint  not null default 0 check (paid_spin_count >= 0),
  updated_at      timestamptz not null default now()
);

-- Seed with the paid spins already made (rows that charged 99 or 50 coins), only if the counter row does not exist yet.
insert into public.wheel_state (id, paid_spin_count)
select 1, count(*) from public.wallet_ledger where reason = 'spin' and coins_delta in (-99, -50)
on conflict (id) do nothing;

alter table public.wheel_state enable row level security;
revoke all on public.wheel_state from anon, authenticated;

alter table public.spin_logs add column if not exists paid_spin_number bigint;

notify pgrst, 'reload schema';
