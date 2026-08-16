-- ============================================================================
-- Venti — the site split
-- ============================================================================
--
-- Two domains, two products. This file is what makes that true in the data
-- rather than only in the branding: every account, every cash event, every
-- promo host and every broadcast now carries the site it belongs to, and the
-- figures the console reports can be asked for one site or for both.
--
-- ----------------------------------------------------------------------------
-- RUN THIS LAST
-- ----------------------------------------------------------------------------
-- It redefines four functions that `sessions.sql` and `go-live.sql` also
-- define — `promo_attribution`, `deposit_start`, `promo_session_start` and
-- `promo_session_stats` — so whichever file is applied last wins, and this is
-- now the one that must be. The order is:
--
--   1. schema.sql
--   2. go-live.sql
--   3. mpesa-demo.sql   (skip if the demo rail is unused)
--   4. sessions.sql
--   5. sites.sql        ← this file
--
-- Re-running sessions.sql afterwards silently un-scopes attribution: deposits
-- would start being credited to whichever broadcast happened to be live on
-- *either* domain. If you ever re-run it, re-run this file after it.
--
-- ----------------------------------------------------------------------------
-- What could not be recovered
-- ----------------------------------------------------------------------------
-- Every row that already exists is assigned to the primary site, because
-- nothing in the database ever recorded which domain a signup or a deposit
-- came through. For accounts created before this migration that assignment is
-- a guess, and for any customer who arrived via the second domain it is the
-- wrong one. There is no way to do better after the fact — the information was
-- never captured. From here on it is recorded at the moment it is known.
-- ----------------------------------------------------------------------------

-- --- 1. The sites ------------------------------------------------------------

create table if not exists public.sites (
  -- A short stable key, not a domain. Domains get renamed, redirected and
  -- replaced; the identity of the product outlives its address, and this value
  -- is written into every account's login identity (see `phone.js`), where a
  -- rename would orphan everybody.
  id          text        primary key check (id ~ '^[a-z][a-z0-9_-]{1,30}$'),
  origin      text        not null unique,
  name        text        not null,
  -- Exactly one site is primary. It is the one whose accounts carry the
  -- untagged login identity, and the one every pre-split row is assigned to.
  is_primary  boolean     not null default false,
  created_at  timestamptz not null default now()
);

create unique index if not exists sites_single_primary_idx
  on public.sites ((is_primary)) where is_primary;

insert into public.sites (id, origin, name, is_primary) values
  ('venti',  'https://ventitradingfx.com', 'Venti',     true),
  ('candix', 'https://candixfx.com',       'Candix FX', false)
on conflict (id) do update
  set origin = excluded.origin,
      name   = excluded.name;

alter table public.sites enable row level security;

/*
 * The primary site's id, as a function so nothing has to hardcode 'venti'.
 *
 * Used as the column default below, which means the fallback for anything that
 * forgets to state a site is the domain that predates the split — never the
 * newer one, whose rows would then be indistinguishable from unattributed ones.
 */
create or replace function public.primary_site()
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select id from public.sites where is_primary limit 1),
    'venti'
  );
$$;

-- --- 2. The columns ----------------------------------------------------------

alter table public.profiles
  add column if not exists site text not null default public.primary_site();

alter table public.cash_events
  add column if not exists site text not null default public.primary_site();

alter table public.promo_hosts
  add column if not exists site text not null default public.primary_site();

alter table public.promo_sessions
  add column if not exists site text not null default public.primary_site();

-- Foreign keys added separately from the columns so re-running the file over a
-- database that already has the columns still installs the constraints.
do $$ begin
  alter table public.profiles
    add constraint profiles_site_fkey foreign key (site) references public.sites (id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.cash_events
    add constraint cash_events_site_fkey foreign key (site) references public.sites (id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.promo_hosts
    add constraint promo_hosts_site_fkey foreign key (site) references public.sites (id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.promo_sessions
    add constraint promo_sessions_site_fkey foreign key (site) references public.sites (id);
exception when duplicate_object then null; end $$;

create index if not exists profiles_site_idx     on public.profiles (site, created_at desc);
create index if not exists cash_events_site_idx  on public.cash_events (site, created_at desc);
create index if not exists promo_hosts_site_idx  on public.promo_hosts (site);

-- --- 3. One phone number per site, not per platform --------------------------

/*
 * The change that makes them two products rather than two front doors.
 *
 * `profiles.phone` was globally unique, so one number meant one account across
 * everything. Two products means the same person may hold an account on each,
 * with separate balances, neither aware of the other — so the uniqueness moves
 * to (site, phone).
 *
 * The login identity has to move with it, and that half lives in the service:
 * `phone.js` tags the derived address for every non-primary site. The primary
 * site's accounts keep the bare `254…@meridian.invalid` they already have, so
 * nothing that exists today is orphaned. That domain is never renamed.
 */
alter table public.promo_hosts drop constraint if exists promo_hosts_phone_key;
create unique index if not exists promo_hosts_site_phone_idx
  on public.promo_hosts (site, phone);

alter table public.profiles drop constraint if exists profiles_phone_key;
create unique index if not exists profiles_site_phone_idx
  on public.profiles (site, phone);

-- --- 3a. The profile bootstrap has to carry the site through -----------------

/*
 * `schema.sql` creates the profile row from a trigger on `auth.users`, reading
 * the phone and username out of the sign-up metadata. The site has to travel
 * the same way, because the row is created before any application code sees it
 * — an UPDATE afterwards would leave a window in which the account exists on
 * the wrong product.
 *
 * The fallback is the primary site rather than an error: a user created by some
 * path that predates this (the Supabase dashboard, a script) still gets a valid
 * row, and gets it on the domain that existed first.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, phone, username, site)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone, ''),
    coalesce(new.raw_user_meta_data ->> 'username', 'trader'),
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

-- --- 4. One live broadcast per site ------------------------------------------

/*
 * Was: one live session across the whole platform. Now: one per site, so a host
 * on each domain can be on air at the same moment without blocking the other.
 *
 * Same trick as before — a partial unique index over open rows only — with the
 * site as the key instead of a constant.
 */
drop index if exists public.promo_sessions_single_live_idx;

create unique index if not exists promo_sessions_single_live_per_site_idx
  on public.promo_sessions (site)
  where ended_at is null;

-- --- 5. Stamping a cash event with its site ----------------------------------

/*
 * A trigger rather than an argument on every function that inserts one.
 *
 * Deposits go through `deposit_start`, withdrawals through the withdrawal
 * queue, and the demo rail through its own routes. Threading a site parameter
 * through all of them is three chances to forget; reading it from the account
 * that raised the event is one rule that cannot be forgotten, and it is
 * correct by construction because an account cannot change site.
 *
 * Denormalised deliberately. It is derivable by joining `profiles`, but the
 * site of the money at the time it moved is a fact about the event, and every
 * report in the console groups by it.
 */
alter table public.cash_events
  add column if not exists is_demo boolean not null default false;

create index if not exists cash_events_real_money_idx
  on public.cash_events (site, kind, status)
  where not is_demo;

create or replace function public.cash_events_stamp_site()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_demo boolean := false;
begin
  select p.site into new.site
    from public.profiles p
   where p.id = new.user_id;

  if new.site is null then
    new.site := public.primary_site();
  end if;

  /*
   * Is this prop money?
   *
   * The M-Pesa clone settles against a demo wallet, but its deposits go through
   * the same `deposit_start` / `deposit_settle` pair as a real PayHero push —
   * so they land here as COMPLETED deposits and are, on the row alone,
   * indistinguishable from money that actually arrived. That is why the console
   * reported far more collected than the PayHero dashboard ever showed.
   *
   * Recorded at insert rather than derived at read, deliberately. The condition
   * "this account is wired to the clone" is true *now*; unlinking a handset
   * after a demo would silently turn a month of prop money into revenue if
   * every report re-evaluated it. What was demo at the time it moved stays
   * demo.
   *
   * The table is optional — a deployment that never runs mpesa-demo.sql has no
   * such table — hence the catalogue check and the dynamic query.
   */
  if to_regclass('public.mpesa_demo_wallet') is not null then
    execute 'select exists (select 1 from public.mpesa_demo_wallet where user_id = $1)'
       into v_demo
      using new.user_id;
  end if;

  new.is_demo := coalesce(v_demo, false);

  return new;
end;
$$;

/*
 * Backfill, once, for everything that predates the flag.
 *
 * The best available guess and no better: an account wired to the clone today
 * is assumed to have been wired to it when it deposited. A demo account whose
 * handset was unlinked before this ran is counted as real money and cannot be
 * found — nothing recorded it. Guarded so re-running the file does not
 * re-stamp rows an admin has since corrected by hand.
 */
do $$
begin
  if to_regclass('public.mpesa_demo_wallet') is not null
     and not exists (select 1 from public.cash_events where is_demo)
  then
    update public.cash_events c
       set is_demo = true
      from public.mpesa_demo_wallet w
     where w.user_id = c.user_id;
  end if;
end $$;

drop trigger if exists cash_events_stamp_site_trg on public.cash_events;
create trigger cash_events_stamp_site_trg
  before insert on public.cash_events
  for each row execute function public.cash_events_stamp_site();

-- --- 6. Attribution, scoped to the depositor's own site ----------------------

/*
 * Which broadcast, if any, a deposit belongs to — now answered per site.
 *
 * The bug this closes is not hypothetical: with one live session allowed per
 * site, two can be open at once, and the old query took whichever row it found
 * first. A Candix customer's deposit would have been credited to a Venti host's
 * broadcast roughly half the time.
 *
 * The demo-handset exclusion is unchanged and still matters: those settle
 * against a prop wallet, so counting them would inflate a host's record with
 * money nobody collected.
 */
create or replace function public.promo_attribution(p_user uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_session uuid;
  v_site    text;
  v_demo    boolean := false;
begin
  select site into v_site from public.profiles where id = p_user;
  if v_site is null then
    return null;
  end if;

  select id into v_session
    from public.promo_sessions
   where ended_at is null
     and site = v_site
   limit 1;

  if v_session is null then
    return null;
  end if;

  if to_regclass('public.mpesa_demo_wallet') is not null then
    execute 'select exists (select 1 from public.mpesa_demo_wallet where user_id = $1)'
       into v_demo
      using p_user;
  end if;

  if v_demo then
    return null;
  end if;

  return v_session;
end;
$$;

-- --- 7. deposit_start, unchanged except that attribution now knows the site --

/*
 * Byte-for-byte the function from sessions.sql. It is restated here only
 * because this file must be the last one applied, and a reader comparing the
 * two should find no difference: all the site-awareness lives in
 * `promo_attribution` and in the trigger above.
 */
create or replace function public.deposit_start(
  p_user   uuid,
  p_amount bigint,
  p_phone  text
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_amount is null or p_amount < 10000 then
    raise exception 'BAD_AMOUNT';
  end if;
  if p_amount > 25000000 then
    raise exception 'AMOUNT_TOO_LARGE';
  end if;

  insert into public.cash_events (user_id, kind, amount_minor, status, phone, session_id)
  values (p_user, 'DEPOSIT', p_amount, 'PENDING', p_phone, public.promo_attribution(p_user))
  returning id into v_id;

  return v_id;
end;
$$;

-- --- 8. Opening a broadcast on the host's own site ---------------------------

/*
 * The host's site decides the session's, so nothing has to be passed in and a
 * host can never open a broadcast for the domain they do not work on.
 *
 * SESSION_RUNNING now means "on this site", which is the whole point: the two
 * desks no longer block each other.
 */
create or replace function public.promo_session_start(
  p_host  uuid,
  p_spend bigint
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
  v_site   text;
  v_id     uuid;
begin
  if p_spend is null or p_spend < 0 then
    raise exception 'BAD_SPEND';
  end if;
  if p_spend > 100000000 then
    raise exception 'BAD_SPEND';
  end if;

  perform public.promo_sessions_reap();

  select status, site into v_status, v_site
    from public.promo_hosts
   where id = p_host;

  if not found then
    raise exception 'NO_SUCH_HOST';
  end if;
  if v_status <> 'ACTIVE' then
    raise exception 'HOST_SUSPENDED';
  end if;

  if exists (
    select 1 from public.promo_sessions
     where ended_at is null and site = v_site
  ) then
    raise exception 'SESSION_RUNNING';
  end if;

  insert into public.promo_sessions (host_id, spend_minor, site)
  values (p_host, p_spend, v_site)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'SESSION_RUNNING';
end;
$$;

-- --- 9. Session stats, with sign-ups counted on the right domain -------------

/*
 * Only `registered` changes: it counted every account created during the
 * broadcast's window, platform-wide. On a two-product platform that credited a
 * Venti host with Candix's sign-ups whenever the clocks overlapped.
 */
create or replace function public.promo_session_stats(p_session uuid)
returns table (
  deposit_count  bigint,
  deposit_minor  bigint,
  pending_count  bigint,
  pending_minor  bigint,
  failed_count   bigint,
  depositors     bigint,
  new_depositors bigint,
  signups        bigint
)
language sql
stable
security definer set search_path = public
as $$
  with window_of as (
    select started_at, coalesce(ended_at, now()) as until, site
      from public.promo_sessions
     where id = p_session
  ),
  booked as (
    -- `not is_demo` is belt and braces: `promo_attribution` already refuses to
    -- stamp a demo account's deposit with a session id, so one should never
    -- appear here. Stated anyway, because a takings figure that silently
    -- included prop money is precisely the failure this file exists to end.
    select user_id, status, amount_minor
      from public.cash_events
     where session_id = p_session
       and kind = 'DEPOSIT'
       and not is_demo
  ),
  totals as (
    select
      count(*) filter (where status = 'COMPLETED')                       as deposit_count,
      coalesce(sum(amount_minor) filter (where status = 'COMPLETED'), 0) as deposit_minor,
      count(*) filter (where status = 'PENDING')                         as pending_count,
      coalesce(sum(amount_minor) filter (where status = 'PENDING'), 0)   as pending_minor,
      count(*) filter (where status = 'FAILED')                          as failed_count,
      count(distinct user_id) filter (where status = 'COMPLETED')        as depositors
    from booked
  ),
  acquired as (
    select count(*) as new_depositors
      from (select distinct user_id from booked where status = 'COMPLETED') d
     where p_session = (
       select c.session_id
         from public.cash_events c
        where c.user_id = d.user_id
          and c.kind = 'DEPOSIT'
          and c.status = 'COMPLETED'
        order by c.settled_at asc nulls last, c.created_at asc
        limit 1
     )
  ),
  registered as (
    select count(*) as signups
      from public.profiles p, window_of w
     where p.created_at >= w.started_at
       and p.created_at <= w.until
       and p.site = w.site
  )
  select totals.deposit_count, totals.deposit_minor,
         totals.pending_count, totals.pending_minor,
         totals.failed_count, totals.depositors,
         acquired.new_depositors, registered.signups
    from totals, acquired, registered;
$$;

-- --- 10. The report, filterable by site --------------------------------------

/*
 * Dropped rather than replaced: adding a third parameter with a default creates
 * an *overload*, and a two-argument call would then be ambiguous between the
 * old function and the new one. Postgres refuses that at call time, which would
 * take the console down rather than fail loudly here.
 */
drop function if exists public.promo_sessions_report(uuid, integer);

create or replace function public.promo_sessions_report(
  p_host  uuid    default null,
  p_limit integer default 50,
  -- Null means every site — the combined view the console opens on.
  p_site  text    default null
)
returns table (
  id             uuid,
  host_id        uuid,
  host_name      text,
  host_phone     text,
  host_status    text,
  site           text,
  spend_minor    bigint,
  started_at     timestamptz,
  ended_at       timestamptz,
  ended_by       text,
  deposit_count  bigint,
  deposit_minor  bigint,
  pending_count  bigint,
  pending_minor  bigint,
  failed_count   bigint,
  depositors     bigint,
  new_depositors bigint,
  signups        bigint
)
language sql
stable
security definer set search_path = public
as $$
  select
    s.id, s.host_id, h.full_name, h.phone, h.status, s.site,
    s.spend_minor, s.started_at, s.ended_at, s.ended_by,
    coalesce(st.deposit_count, 0),
    coalesce(st.deposit_minor, 0),
    coalesce(st.pending_count, 0),
    coalesce(st.pending_minor, 0),
    coalesce(st.failed_count, 0),
    coalesce(st.depositors, 0),
    coalesce(st.new_depositors, 0),
    coalesce(st.signups, 0)
  from public.promo_sessions s
  join public.promo_hosts h on h.id = s.host_id
  left join lateral public.promo_session_stats(s.id) st on true
  where (p_host is null or s.host_id = p_host)
    and (p_site is null or s.site = p_site)
  order by s.started_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- --- 11. The platform, per site ----------------------------------------------

/*
 * One row per site: the console's Domains page, and the answer to "what did
 * each product actually bring in".
 *
 * Every site appears even with nothing on it — a left join from `sites`, not a
 * group-by over events. A domain that took no money this month is a fact worth
 * showing as a zero; a domain missing from the table reads as a bug.
 *
 * Withdrawals are counted as *completed* only. A pending withdrawal is money
 * still held, not money gone, and netting it here would make a product look
 * poorer than it is for as long as the queue is unattended.
 */
create or replace function public.site_totals()
returns table (
  site              text,
  name              text,
  origin            text,
  is_primary        boolean,
  users             bigint,
  live_balance      bigint,
  deposit_count     bigint,
  deposit_minor     bigint,
  pending_minor     bigint,
  withdrawal_count  bigint,
  withdrawal_minor  bigint,
  hosts             bigint,
  sessions          bigint,
  live_now          boolean
)
language sql
stable
security definer set search_path = public
as $$
  select
    s.id,
    s.name,
    s.origin,
    s.is_primary,
    coalesce(p.users, 0),
    coalesce(p.live_balance, 0),
    coalesce(c.deposit_count, 0),
    coalesce(c.deposit_minor, 0),
    coalesce(c.pending_minor, 0),
    coalesce(c.withdrawal_count, 0),
    coalesce(c.withdrawal_minor, 0),
    coalesce(h.hosts, 0),
    coalesce(g.sessions, 0),
    coalesce(g.live_now, false)
  from public.sites s
  -- Every column below is table-qualified and every subquery aliases its
  -- grouping key to something other than `site`. `site` is an output column of
  -- this function, and an unqualified reference to it inside the body is the
  -- kind of ambiguity Postgres resolves at CREATE time on one version and
  -- rejects on the next.
  left join (
    select pr.site as for_site,
           count(*) as users,
           sum(pr.live_balance) as live_balance
      from public.profiles pr group by pr.site
  ) p on p.for_site = s.id
  -- Real money only. Every figure below excludes the clone rail, so what this
  -- page reports as collected is what PayHero actually settled.
  left join (
    select ce.site as for_site,
           count(*) filter (
             where ce.kind = 'DEPOSIT' and ce.status = 'COMPLETED')             as deposit_count,
           coalesce(sum(ce.amount_minor) filter (
             where ce.kind = 'DEPOSIT' and ce.status = 'COMPLETED'), 0)         as deposit_minor,
           coalesce(sum(ce.amount_minor) filter (
             where ce.kind = 'DEPOSIT' and ce.status = 'PENDING'), 0)           as pending_minor,
           count(*) filter (
             where ce.kind = 'WITHDRAWAL' and ce.status = 'COMPLETED')          as withdrawal_count,
           coalesce(sum(ce.amount_minor) filter (
             where ce.kind = 'WITHDRAWAL' and ce.status = 'COMPLETED'), 0)      as withdrawal_minor
      from public.cash_events ce
     where not ce.is_demo
     group by ce.site
  ) c on c.for_site = s.id
  left join (
    select ph.site as for_site, count(*) as hosts
      from public.promo_hosts ph group by ph.site
  ) h on h.for_site = s.id
  left join (
    select ps.site as for_site,
           count(*) as sessions,
           bool_or(ps.ended_at is null) as live_now
      from public.promo_sessions ps group by ps.site
  ) g on g.for_site = s.id
  order by s.is_primary desc, s.name;
$$;

-- --- 12. The daily series behind the Overview charts -------------------------

/*
 * One row per site per day, for the last `p_days` days.
 *
 * Zero-filled from `generate_series` crossed with `sites`, so a day nobody
 * deposited is a zero rather than a gap. A line chart that simply skips absent
 * days draws a straight segment across the hole and reads as steady trade over
 * a period when nothing happened, which is the opposite of the truth.
 *
 * Real money only, like everything else here: `not is_demo`.
 */
create or replace function public.site_daily(p_days integer default 30)
returns table (
  day            date,
  site           text,
  deposit_minor  bigint,
  deposit_count  bigint,
  depositors     bigint,
  signups        bigint
)
language sql
stable
security definer set search_path = public
as $$
  with span as (
    select generate_series(
      (current_date - (greatest(1, least(coalesce(p_days, 30), 180)) - 1) * interval '1 day')::date,
      current_date,
      interval '1 day'
    )::date as d
  ),
  grid as (
    select span.d, s.id as for_site from span cross join public.sites s
  ),
  money as (
    select ce.site as for_site,
           (ce.settled_at at time zone 'Africa/Nairobi')::date as d,
           coalesce(sum(ce.amount_minor), 0) as deposit_minor,
           count(*)                          as deposit_count,
           count(distinct ce.user_id)        as depositors
      from public.cash_events ce
     where ce.kind = 'DEPOSIT'
       and ce.status = 'COMPLETED'
       and not ce.is_demo
       and ce.settled_at is not null
     group by 1, 2
  ),
  joined as (
    select pr.site as for_site,
           (pr.created_at at time zone 'Africa/Nairobi')::date as d,
           count(*) as signups
      from public.profiles pr
     group by 1, 2
  )
  select grid.d,
         grid.for_site,
         coalesce(money.deposit_minor, 0),
         coalesce(money.deposit_count, 0),
         coalesce(money.depositors, 0),
         coalesce(joined.signups, 0)
    from grid
    left join money  on money.for_site  = grid.for_site and money.d  = grid.d
    left join joined on joined.for_site = grid.for_site and joined.d = grid.d
   order by grid.d, grid.for_site;
$$;

-- --- Grants -------------------------------------------------------------------
-- Nothing here is reachable from a browser. Restated for the functions this
-- file creates or whose signature it changed; `create or replace` preserved the
-- rest from sessions.sql.

revoke all on function public.primary_site()                                  from public, anon, authenticated;
revoke all on function public.cash_events_stamp_site()                        from public, anon, authenticated;
revoke all on function public.site_totals()                                   from public, anon, authenticated;
revoke all on function public.promo_sessions_report(uuid, integer, text)      from public, anon, authenticated;
revoke all on function public.deposit_start(uuid, bigint, text)               from public, anon, authenticated;
revoke all on function public.promo_session_start(uuid, bigint)               from public, anon, authenticated;
revoke all on function public.promo_session_stats(uuid)                       from public, anon, authenticated;
revoke all on function public.promo_attribution(uuid)                         from public, anon, authenticated;

revoke all on function public.site_daily(integer)                             from public, anon, authenticated;

grant execute on function public.site_totals()                                to service_role;
grant execute on function public.site_daily(integer)                          to service_role;
grant execute on function public.promo_sessions_report(uuid, integer, text)   to service_role;
grant execute on function public.deposit_start(uuid, bigint, text)            to service_role;
grant execute on function public.promo_session_start(uuid, bigint)            to service_role;
grant execute on function public.promo_session_stats(uuid)                    to service_role;

-- `sites` is readable by the service only, like every other table here. The
-- console gets it through `site_totals()`; the browser never queries it.
revoke all on table public.sites from public, anon, authenticated;
grant select on table public.sites to service_role;
