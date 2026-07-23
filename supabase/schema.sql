-- ============================================================================
-- Meridian — Supabase schema (scaffold)
-- ============================================================================
--
-- Run this in the Supabase SQL editor (or `supabase db push`) once the project
-- exists. It mirrors the shapes the client-side simulation already uses
-- (src/lib/auth.ts, src/lib/store.ts, src/lib/trading.ts) so the migration off
-- localStorage is a swap of data source, not a redesign.
--
-- Money is stored as BIGINT minor units (KES cents) everywhere, matching the
-- app's bigint discipline — never a floating-point currency amount.
--
-- Auth: users are Supabase Auth users. The Kenyan mobile number is the login
-- identity; carry it in auth metadata or a dedicated column as your flow
-- requires. `profiles.id` references `auth.users`.
-- ----------------------------------------------------------------------------

-- --- Enums ------------------------------------------------------------------
do $$ begin
  create type account_kind as enum ('DEMO', 'LIVE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type live_tier as enum ('STANDARD', 'VIP');
exception when duplicate_object then null; end $$;

do $$ begin
  create type trade_direction as enum ('UP', 'DOWN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type trade_status as enum ('OPEN', 'WON', 'LOST', 'TIE', 'VOIDED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cash_kind as enum ('DEPOSIT', 'WITHDRAWAL');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cash_status as enum ('PENDING', 'COMPLETED', 'FAILED');
exception when duplicate_object then null; end $$;

-- --- Profiles ---------------------------------------------------------------
-- One row per user. Balances are kept per account kind; the live tier decides
-- the payout terms a LIVE contract is booked at (see effectivePayoutBps).
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  phone          text unique not null,
  username       text not null,
  live_tier      live_tier not null default 'STANDARD',
  demo_balance   bigint not null default 10000000, -- KES 100,000.00
  live_balance   bigint not null default 0,
  created_at     timestamptz not null default now()
);

-- --- Cash events (deposits / withdrawals) -----------------------------------
create table if not exists public.cash_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  kind           cash_kind not null,
  amount_minor   bigint not null check (amount_minor > 0),
  status         cash_status not null default 'PENDING',
  phone          text not null,
  reference      text,                 -- M-Pesa-style ref, issued on completion
  bonus_minor    bigint not null default 0, -- first-deposit bonus, if credited
  created_at     timestamptz not null default now(),
  settled_at     timestamptz
);
create index if not exists cash_events_user_idx on public.cash_events (user_id, created_at desc);

-- --- Trades -----------------------------------------------------------------
-- payout_bps is frozen at placement (base instrument rate + VIP bonus), so
-- settlement never needs to know the tier.
create table if not exists public.trades (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  account_kind  account_kind not null,
  symbol        text not null,
  direction     trade_direction not null,
  status        trade_status not null default 'OPEN',
  stake_minor   bigint not null check (stake_minor > 0),
  payout_bps    integer not null,
  open_price    double precision not null,
  close_price   double precision,
  duration_sec  integer not null,
  opened_at     timestamptz not null default now(),
  expires_at    timestamptz not null,
  settled_at    timestamptz,
  pnl_minor     bigint
);
create index if not exists trades_user_idx on public.trades (user_id, opened_at desc);
create index if not exists trades_open_idx on public.trades (status) where status = 'OPEN';

-- ============================================================================
-- Row-level security
-- ----------------------------------------------------------------------------
-- A user may only ever see and touch their own rows. Balances and settlement
-- must be written by trusted server code (service role / SECURITY DEFINER
-- functions), not by the client — the client may INSERT its own trades and
-- cash requests but must not be able to hand itself a balance.
-- ============================================================================
alter table public.profiles     enable row level security;
alter table public.cash_events  enable row level security;
alter table public.trades       enable row level security;

create policy "own profile"     on public.profiles
  for select using (auth.uid() = id);
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "own cash events" on public.cash_events
  for select using (auth.uid() = user_id);
create policy "raise own cash"  on public.cash_events
  for insert with check (auth.uid() = user_id);

create policy "own trades"      on public.trades
  for select using (auth.uid() = user_id);
create policy "place own trades" on public.trades
  for insert with check (auth.uid() = user_id);

-- --- Profile bootstrap ------------------------------------------------------
-- Create a profile row automatically when a new auth user signs up. Reads the
-- phone/username from the sign-up metadata your client passes.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, phone, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone, ''),
    coalesce(new.raw_user_meta_data ->> 'username', 'trader')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
