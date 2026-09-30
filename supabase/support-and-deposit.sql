-- ============================================================================
-- Deposit number, support tickets, Google sign-in, and a closed hole
-- ----------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, after schema.sql, go-live.sql and
-- sites.sql. Every statement is idempotent: running it twice changes nothing.
-- ============================================================================


-- --- 0. Customers may no longer write their own profile row ------------------

/*
 * `schema.sql` shipped an "update own profile" policy. Nothing in the app uses
 * it — every balance, tier and number change goes through a SECURITY DEFINER
 * function or the service role — but while it exists, any signed-in customer
 * can PATCH `profiles` through the public REST API and set their own
 * `live_balance` or `live_tier`. Dropping it removes that; the functions below
 * are the only writes a customer gets.
 */
drop policy if exists "update own profile" on public.profiles;


-- --- 1. The deposit number ---------------------------------------------------

/*
 * The M-Pesa number deposit prompts go to, when it is not the registered one.
 * Deliberately *not* unique: a family phone may fund several accounts. It is
 * never the account's identity and never where a withdrawal is paid — those
 * stay on `profiles.phone`.
 */
alter table public.profiles add column if not exists deposit_phone text;

alter table public.profiles drop constraint if exists profiles_deposit_phone_format;
alter table public.profiles add constraint profiles_deposit_phone_format
  check (deposit_phone is null or deposit_phone ~ '^254[17][0-9]{8}$');

/*
 * Sets (or, with null, clears) the caller's own deposit number. The only way a
 * customer writes to `profiles` now; it touches this one column.
 */
create or replace function public.set_deposit_phone(p_phone text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if v_phone is not null and v_phone !~ '^254[17][0-9]{8}$' then
    raise exception 'BAD_PHONE';
  end if;

  -- Saving the registered number is the same as clearing it.
  update public.profiles
     set deposit_phone = case when v_phone = phone then null else v_phone end
   where id = auth.uid();

  return v_phone;
end;
$$;

revoke all on function public.set_deposit_phone(text) from public, anon;
grant execute on function public.set_deposit_phone(text) to authenticated;


-- --- 2. Google sign-in: an account can exist before it has a number ----------

/*
 * A Google sign-in creates the auth user with no phone. The profile row still
 * has to exist (every RLS read keys on it), so the number becomes nullable and
 * is filled in once by the payments service's `/api/auth/link-phone`, which is
 * also what enforces one number per site. The (site, phone) unique index
 * ignores NULLs, so any number of not-yet-linked accounts can coexist.
 */
alter table public.profiles alter column phone drop not null;

-- Rows that the old trigger wrote with an empty-string phone become NULL.
update public.profiles set phone = null where phone = '';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, phone, username, site)
  values (
    new.id,
    nullif(coalesce(new.raw_user_meta_data ->> 'phone', new.phone, ''), ''),
    coalesce(
      new.raw_user_meta_data ->> 'username',
      -- Google puts the display name here.
      nullif(left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'full_name',
                                          new.raw_user_meta_data ->> 'name', ''),
                                 '[^A-Za-z0-9_ ]', '', 'g'), 24), ''),
      'trader'
    ),
    coalesce(
      (select s.id from public.sites s
        where s.id = new.raw_user_meta_data ->> 'site'),
      public.primary_site()
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


-- --- 3. Support tickets ------------------------------------------------------

/*
 * Raised from /support, signed in or not (a forgotten password is exactly the
 * case where you cannot sign in). Inserts go through the payments service so a
 * signed-out form can be rate-limited; customers read their own through RLS.
 */
do $$ begin
  create type ticket_status as enum ('OPEN', 'RESOLVED');
exception when duplicate_object then null; end $$;

create table if not exists public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id) on delete set null,
  site         text references public.sites (id),
  phone        text not null check (phone ~ '^254[17][0-9]{8}$'),
  category     text not null check (category in
                 ('DEPOSIT', 'WITHDRAWAL', 'TRADING', 'ACCOUNT', 'PASSWORD', 'OTHER')),
  subject      text not null check (char_length(subject) between 3 and 120),
  message      text not null check (char_length(message) between 10 and 2000),
  status       ticket_status not null default 'OPEN',
  admin_note   text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create index if not exists support_tickets_status_idx
  on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_user_idx
  on public.support_tickets (user_id, created_at desc);

alter table public.support_tickets enable row level security;

drop policy if exists "own tickets" on public.support_tickets;
create policy "own tickets" on public.support_tickets
  for select using (auth.uid() = user_id);
-- No insert/update policy: writes are the service role's alone.
