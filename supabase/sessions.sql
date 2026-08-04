-- ============================================================================
-- Venti — promo sessions (the TikTok live desk)
-- ============================================================================
--
-- Run AFTER go-live.sql (and after mpesa-demo.sql, if you use the demo rail),
-- in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- IMPORTANT — run this file LAST. It redefines `public.deposit_start`, adding
-- the one line that attributes a deposit to whichever session was live when the
-- push was raised. Re-running go-live.sql later restores the unattributed
-- version, and deposits silently stop being counted, so re-run this file after
-- it. (A note to that effect is at the top of go-live.sql too.)
--
-- What this is for
-- ----------------------------------------------------------------------------
-- Staff go live on TikTok, market the app, and trade alongside whoever is
-- watching. A "session" is one of those broadcasts: the host opens it when the
-- stream starts and closes it when the stream ends, and every deposit raised in
-- between is booked against it. What that buys is the only question worth
-- asking about a live — did the money it brought in beat the money spent
-- promoting it — answered per host, per broadcast.
--
-- The shape of it
-- ----------------------------------------------------------------------------
--   promo_hosts     one row per employee. Their own credentials, deliberately
--                   NOT Supabase Auth users: a host is staff, not a customer,
--                   and the customer identity namespace (`254…@meridian.invalid`)
--                   is keyed on the phone number — the same person being both
--                   would collide. Passwords are scrypt-hashed by the backend
--                   service; this schema only ever sees the digest.
--   promo_sessions  one row per broadcast. At most one may be open at a time,
--                   enforced by a partial unique index rather than by a check
--                   in application code, because two hosts pressing Start at
--                   once is exactly the case application code loses.
--   cash_events.session_id
--                   the attribution. Stamped once, at initiation, and never
--                   recomputed — a session's takings must not change shape
--                   later because someone edited a timestamp.
--
-- Privilege model: service_role only. Both tables have RLS enabled with no
-- policies, so `anon` and `authenticated` cannot read or write them at all. The
-- host portal and the admin console both reach them through the backend
-- service, which authenticates the caller first.
-- ----------------------------------------------------------------------------

-- --- 1. Hosts ---------------------------------------------------------------

create table if not exists public.promo_hosts (
  id            uuid        primary key default gen_random_uuid(),
  full_name     text        not null,
  phone         text        not null unique,
  -- `scrypt$<salt-hex>$<hash-hex>`. The scheme prefix is carried so the digest
  -- can be re-parameterised later without guessing what old rows are.
  password_hash text        not null,
  status        text        not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUSPENDED')),
  created_at    timestamptz not null default now()
);

-- --- 2. Sessions ------------------------------------------------------------

create table if not exists public.promo_sessions (
  id          uuid        primary key default gen_random_uuid(),
  host_id     uuid        not null references public.promo_hosts (id) on delete cascade,
  -- What the host paid to promote this broadcast, in cents. Entered at Start,
  -- before the numbers it will be judged against exist — which is the only
  -- moment it can be recorded honestly.
  spend_minor bigint      not null default 0 check (spend_minor >= 0),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  ended_by    text        check (ended_by in ('HOST', 'ADMIN', 'AUTO')),
  constraint promo_sessions_ended_after_start check (ended_at is null or ended_at >= started_at)
);

/*
 * One live session at a time, enforced in the index.
 *
 * The unique key is the expression `(ended_at is null)`, over only those rows
 * where it holds — so the index contains the single value `true` at most once,
 * and a second insert while one is open fails outright. An `if not exists`
 * check in a function is a race with a window the width of a network round
 * trip; this closes it.
 */
create unique index if not exists promo_sessions_single_live_idx
  on public.promo_sessions ((ended_at is null))
  where ended_at is null;

create index if not exists promo_sessions_host_idx
  on public.promo_sessions (host_id, started_at desc);

alter table public.promo_hosts    enable row level security;
alter table public.promo_sessions enable row level security;

-- --- 3. Attribution on cash_events ------------------------------------------

alter table public.cash_events
  add column if not exists session_id uuid references public.promo_sessions (id) on delete set null;

create index if not exists cash_events_session_idx
  on public.cash_events (session_id)
  where session_id is not null;

/*
 * Which session, if any, a deposit from this user belongs to.
 *
 * Returns null when nothing is live — the ordinary case, and the reason the
 * whole feature is invisible to a deployment that never runs a broadcast.
 *
 * It also returns null for an account wired to the M-Pesa clone handset. Those
 * deposits settle against a prop wallet (see mpesa-demo.sql), so counting them
 * as takings would inflate the one number a host's work is measured by with
 * money that was never collected. A demonstration during a live is still a
 * demonstration. The table is optional — a deployment that does not use the
 * demo rail never runs that migration — hence the catalogue check and the
 * dynamic query, which is what keeps this function loadable either way.
 */
create or replace function public.promo_attribution(p_user uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_session uuid;
  v_demo    boolean := false;
begin
  select id into v_session
    from public.promo_sessions
   where ended_at is null
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

-- --- 4. deposit_start, with attribution --------------------------------------

/*
 * Byte-for-byte the function from go-live.sql, plus `session_id`.
 *
 * Redefined here rather than edited there so the two migrations stay
 * independently runnable — but that means whichever file is applied last wins,
 * and this is the one that must be. See the note at the top.
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
  -- KSh 100 minimum, KSh 250,000 maximum — the latter is M-Pesa's own
  -- per-transaction ceiling, so a larger push could not settle anyway.
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

-- --- 5. Opening and closing a session ----------------------------------------

/** How long a forgotten broadcast is allowed to hold the desk before the next
 *  Start reclaims it. Long enough that a genuine marathon live is never cut
 *  short, short enough that a host who closed their laptop does not block the
 *  team until someone notices. */
create or replace function public.promo_sessions_reap()
returns integer
language sql
security definer set search_path = public
as $$
  with closed as (
    update public.promo_sessions
       set ended_at = started_at + interval '12 hours',
           ended_by = 'AUTO'
     where ended_at is null
       and started_at < now() - interval '12 hours'
    returning 1
  )
  select coalesce(count(*), 0)::integer from closed;
$$;

/*
 * Opens a broadcast. Raises rather than returns on refusal, so no caller can
 * mistake a refusal for a session id:
 *
 *   NO_SUCH_HOST    — the token names a host that no longer exists
 *   HOST_SUSPENDED  — an admin has taken this host off the roster
 *   SESSION_RUNNING — somebody else is live (or this host already is)
 *   BAD_SPEND       — the promo cost is negative or absurd
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
  v_id     uuid;
begin
  if p_spend is null or p_spend < 0 then
    raise exception 'BAD_SPEND';
  end if;
  -- KSh 1,000,000 on a single broadcast's promotion. Not a business rule so
  -- much as a fat-finger guard: the figure is typed in a hurry, seconds before
  -- going live, and it is the denominator of every number on the page after.
  if p_spend > 100000000 then
    raise exception 'BAD_SPEND';
  end if;

  perform public.promo_sessions_reap();

  select status into v_status
    from public.promo_hosts
   where id = p_host;

  if not found then
    raise exception 'NO_SUCH_HOST';
  end if;
  if v_status <> 'ACTIVE' then
    raise exception 'HOST_SUSPENDED';
  end if;

  if exists (select 1 from public.promo_sessions where ended_at is null) then
    raise exception 'SESSION_RUNNING';
  end if;

  insert into public.promo_sessions (host_id, spend_minor)
  values (p_host, p_spend)
  returning id into v_id;

  return v_id;
exception
  -- The index caught what the check above raced past: two Starts in the same
  -- instant. Same answer either way.
  when unique_violation then
    raise exception 'SESSION_RUNNING';
end;
$$;

/*
 * Closes a broadcast. `p_host` scopes it to that host's own session — the host
 * portal passes theirs, the admin console passes null and may close anyone's.
 * Returns false when there was nothing open to close, which is what a double
 * click and an admin racing the host both look like.
 */
create or replace function public.promo_session_end(
  p_session uuid,
  p_by      text,
  p_host    uuid default null
) returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_hit integer;
begin
  -- `p_by is null` first: `null not in (…)` is null, not true, so a null actor
  -- would slip past the check and close a session with no record of who did it.
  if p_by is null or p_by not in ('HOST', 'ADMIN', 'AUTO') then
    raise exception 'BAD_ACTOR';
  end if;

  update public.promo_sessions
     set ended_at = now(),
         ended_by = p_by
   where id = p_session
     and ended_at is null
     and (p_host is null or host_id = p_host);

  get diagnostics v_hit = row_count;
  return v_hit > 0;
end;
$$;

-- --- 6. What a session was worth ---------------------------------------------

/*
 * The scoreboard for one broadcast.
 *
 * Every figure is derived, never stored: a session row holds only when it ran,
 * who ran it, and what it cost, so there is no denormalised total that can
 * drift away from the ledger it summarises.
 *
 *   deposit_*        completed deposits stamped to this session — the takings
 *   pending_*        pushes raised but not yet answered by M-Pesa. Shown apart
 *                    from the takings because they are not money yet, and a
 *                    live that ends with a large pending figure is a different
 *                    story from one that ends with a large completed figure.
 *   failed_count     pushes the customer cancelled or that timed out. Worth
 *                    surfacing: a live where most pushes fail is a live with a
 *                    problem, and it is invisible in the takings alone.
 *   depositors       distinct people who actually paid
 *   new_depositors   of those, the ones for whom this was the first deposit
 *                    they had ever completed — the acquisition number
 *   signups          accounts created while the broadcast was open. Attributed
 *                    by time window rather than by stamp: a sign-up is not a
 *                    cash event and has nowhere to carry a session id.
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
    select started_at, coalesce(ended_at, now()) as until
      from public.promo_sessions
     where id = p_session
  ),
  booked as (
    select user_id, status, amount_minor
      from public.cash_events
     where session_id = p_session
       and kind = 'DEPOSIT'
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
  )
  select totals.deposit_count, totals.deposit_minor,
         totals.pending_count, totals.pending_minor,
         totals.failed_count, totals.depositors,
         acquired.new_depositors, registered.signups
    from totals, acquired, registered;
$$;

/*
 * Every session with its host and its scoreboard, newest first — the admin
 * console's whole page in one round trip, and the host portal's own history
 * when `p_host` narrows it to one person.
 *
 * `left join lateral … on true` rather than a cross join: a session whose stats
 * somehow yield nothing must still appear in the list, because a broadcast
 * missing from the record is worse than one with blank figures.
 */
create or replace function public.promo_sessions_report(
  p_host  uuid    default null,
  p_limit integer default 50
)
returns table (
  id             uuid,
  host_id        uuid,
  host_name      text,
  host_phone     text,
  host_status    text,
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
    s.id, s.host_id, h.full_name, h.phone, h.status,
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
  where p_host is null or s.host_id = p_host
  order by s.started_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- --- Grants -------------------------------------------------------------------
-- Nothing here is reachable from a browser. The host portal and the admin
-- console are both served by the backend service, which holds the service-role
-- key and checks who is asking before it asks Postgres anything.
-- `create or replace` keeps an existing function's grants, so redefining
-- deposit_start above left go-live.sql's privileges intact. Restated anyway, so
-- that running this file against a database where go-live.sql was never applied
-- does not leave a freshly-created deposit_start executable by every role.
revoke all on function public.deposit_start(uuid, bigint, text)         from public, anon, authenticated;
grant execute on function public.deposit_start(uuid, bigint, text)      to service_role;

revoke all on function public.promo_attribution(uuid)                   from public, anon, authenticated;
revoke all on function public.promo_sessions_reap()                     from public, anon, authenticated;
revoke all on function public.promo_session_start(uuid, bigint)         from public, anon, authenticated;
revoke all on function public.promo_session_end(uuid, text, uuid)       from public, anon, authenticated;
revoke all on function public.promo_session_stats(uuid)                 from public, anon, authenticated;
revoke all on function public.promo_sessions_report(uuid, integer)      from public, anon, authenticated;

grant execute on function public.promo_sessions_reap()               to service_role;
grant execute on function public.promo_session_start(uuid, bigint)   to service_role;
grant execute on function public.promo_session_end(uuid, text, uuid) to service_role;
grant execute on function public.promo_session_stats(uuid)           to service_role;
grant execute on function public.promo_sessions_report(uuid, integer) to service_role;

-- `promo_attribution` is called from inside `deposit_start`, which is itself a
-- SECURITY DEFINER function owned by the same role, so it needs no grant of its
-- own — and gets none, keeping it unreachable as an endpoint.
