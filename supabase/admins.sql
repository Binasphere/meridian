-- ============================================================================
-- Venti — admin accounts
-- ============================================================================
--
-- Replaces the single shared `ADMIN_PASSCODE` with real accounts: one row per
-- person, each with their own password, and a role that decides whether they
-- may create and manage other admins.
--
-- Run order — this file is **independent** of the others and may be applied at
-- any point after `schema.sql`. It creates one new table and touches nothing
-- that already exists, so unlike `sessions.sql` it has no ordering hazard.
--
-- Privilege model: service_role only. RLS is enabled with no policies, so
-- `anon` and `authenticated` cannot read or write this table at all — not even
-- the digest column. The console reaches it through the payments service,
-- which authenticates the caller first. This is the same posture as
-- `promo_hosts` in sessions.sql, and for a stronger reason: a leaked admin
-- digest is a leak of the whole database.
--
-- ----------------------------------------------------------------------------
-- Why a passcode was not enough
-- ----------------------------------------------------------------------------
-- One shared secret in Render's environment has three properties that only get
-- worse as the team grows. It cannot be attributed — the audit trail says
-- "an admin", never which one. It cannot be revoked for one person — the only
-- revocation is changing it for everybody, which means telling everybody the
-- new one, over whatever channel is to hand. And it can only be changed by
-- someone with access to the Render dashboard, which is a strictly larger
-- privilege than running the console.
--
-- Accounts fix all three. What they cost is this table and a bootstrap problem,
-- solved at the bottom of this file.
-- ----------------------------------------------------------------------------

-- --- 1. The table ------------------------------------------------------------

create table if not exists public.admin_users (
  id            uuid        primary key default gen_random_uuid(),

  -- The login identifier. Not a phone number, deliberately: a promo host signs
  -- in with a phone (sessions.sql) and the same person may well be both, so
  -- distinct identifier *shapes* keep the two doors from being confused for
  -- each other. Stored already-lowercased by the service; the unique index
  -- below lowercases again so the constraint holds even if something writes
  -- here directly.
  username      text        not null,

  -- For the audit trail and the roster. "Who suspended this account" is a
  -- question a name answers and a username often does not.
  full_name     text        not null,

  -- `scrypt$<salt-hex>$<hash-hex>`, produced by the service's `hashPassword`.
  -- Byte-identical scheme to promo_hosts.password_hash, so one verifier serves
  -- both tables and a future re-parameterisation is one change, not two.
  password_hash text        not null,

  -- The constraint is (re)stated below rather than trusted from here, because
  -- `create table if not exists` does nothing to a table that already exists —
  -- so a role added after the first run would be rejected by a constraint this
  -- file appears to define but never updated.
  role          text        not null default 'ADMIN',

  status        text        not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUSPENDED')),

  -- Who created this account. Null for the bootstrap super admin, which by
  -- definition had nobody to create it. `on delete set null` rather than
  -- cascade: deleting an admin must never delete the people they onboarded.
  created_by    uuid        references public.admin_users (id) on delete set null,

  created_at    timestamptz not null default now(),

  -- Every token this service issues carries the moment it was minted. A token
  -- minted before the password last changed is refused, which is what makes
  -- "change my password" also mean "sign out every other device". Defaults to
  -- creation so a brand-new account's first token is valid.
  password_changed_at timestamptz not null default now(),

  last_login_at timestamptz
);

/*
 * The roles, swapped in idempotently so this file can be re-run to add one.
 *
 *   SUPER_ADMIN     — everything, including managing these accounts.
 *   ADMIN           — everything except managing these accounts.
 *   SESSION_MANAGER — the promo desk only: start and end broadcasts, suspend a
 *                     host. No customers, no balances, no withdrawals, and no
 *                     money figures even on the sessions they run.
 *
 * SESSION_MANAGER is not "ADMIN minus a menu". The service refuses the finance
 * routes outright and strips the money fields from the sessions payload before
 * it is serialised, so the figures never reach the browser. A console that
 * merely hid them would be one devtools tab away from not hiding them.
 */
alter table public.admin_users
  drop constraint if exists admin_users_role_check;

alter table public.admin_users
  add constraint admin_users_role_check
  check (role in ('SUPER_ADMIN', 'ADMIN', 'SESSION_MANAGER'));

-- Case-insensitive uniqueness. `Admin` and `admin` being two accounts is a
-- phishing primitive inside your own console, not a feature.
create unique index if not exists admin_users_username_idx
  on public.admin_users (lower(username));

create index if not exists admin_users_role_idx
  on public.admin_users (role, status);

alter table public.admin_users enable row level security;

-- --- 2. The last-super-admin guard -------------------------------------------

/*
 * A console with no super admin is a console nobody can ever administer again.
 *
 * The service checks this before every demote, suspend and delete, but a check
 * in application code is a race: two super admins, two browser tabs, both
 * demoting the other, both reading "there are two" a moment before the other
 * commits. The window is the width of a round trip and the failure is
 * permanent, so the invariant belongs where it cannot be raced — in the
 * database, evaluated at commit.
 *
 * `deferrable initially deferred` is what makes it usable rather than merely
 * strict: it fires once at COMMIT rather than per statement, so a transaction
 * may promote a new super admin and demote the old one in either order. Only
 * the state you are actually left with has to satisfy the rule.
 *
 * An empty table is allowed on purpose — that is the bootstrap state, and
 * section 4 explains why it has to remain reachable.
 */
create or replace function public.admin_users_require_super()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (select 1 from public.admin_users)
     and not exists (
       select 1 from public.admin_users
        where role = 'SUPER_ADMIN' and status = 'ACTIVE'
     )
  then
    raise exception 'LAST_SUPER_ADMIN'
      using hint = 'Promote another admin to SUPER_ADMIN first.';
  end if;
  return null;
end;
$$;

drop trigger if exists admin_users_require_super_trg on public.admin_users;
create constraint trigger admin_users_require_super_trg
  after update or delete on public.admin_users
  deferrable initially deferred
  for each row execute function public.admin_users_require_super();

-- --- 3. Roster view for the console ------------------------------------------

/*
 * Everything the console lists, and nothing it must not receive.
 *
 * The point of a function here rather than a `select *` in the service is
 * `password_hash`: a route that forgets to name its columns would otherwise
 * ship every digest to the browser. Naming the columns once, server-side, means
 * that mistake has nowhere to happen.
 */
create or replace function public.admin_roster()
returns table (
  id                  uuid,
  username            text,
  full_name           text,
  role                text,
  status              text,
  created_at          timestamptz,
  last_login_at       timestamptz,
  created_by_name     text
)
language sql
security definer set search_path = public
as $$
  select a.id,
         a.username,
         a.full_name,
         a.role,
         a.status,
         a.created_at,
         a.last_login_at,
         c.full_name
    from public.admin_users a
    left join public.admin_users c on c.id = a.created_by
   order by
     -- Super admins first, then by name: the roster is read to answer "who can
     -- do what", and that ordering answers it without a sort.
     case when a.role = 'SUPER_ADMIN' then 0 else 1 end,
     lower(a.full_name);
$$;

-- ============================================================================
-- 4. Bootstrap, and the way back in
-- ----------------------------------------------------------------------------
-- The first super admin cannot be created by a super admin. Something outside
-- the table has to vouch for it once, and the thing already trusted to do that
-- is `ADMIN_PASSCODE` in Render's environment.
--
-- So the passcode does not disappear — it *narrows*. While this table holds no
-- active super admin, the passcode opens a bootstrap session whose only
-- permitted action is creating the first one. The moment that account exists,
-- the passcode stops being accepted anywhere: it is no longer a way in, and
-- leaving it as one would mean the shared secret still had every privilege the
-- accounts were introduced to take away from it.
--
-- LOCKED OUT? The way back is to empty the super-admin bench, which re-opens
-- the bootstrap door for whoever holds ADMIN_PASSCODE. The guard trigger will
-- refuse that from the service, which is the whole point, so it has to be done
-- here in the SQL editor and deliberately:
--
--     alter table public.admin_users disable trigger admin_users_require_super_trg;
--     update public.admin_users set status = 'SUSPENDED' where role = 'SUPER_ADMIN';
--     alter table public.admin_users enable trigger admin_users_require_super_trg;
--
-- Then sign in with ADMIN_PASSCODE, create a fresh super admin, and re-activate
-- or delete the suspended rows from the console. Nothing here can recover a
-- forgotten password — the digests are one-way, which is the property you are
-- paying for.
-- ============================================================================
