-- ============================================================================
-- Venti — the demo M-Pesa wallets
-- ============================================================================
--
-- Run AFTER go-live.sql, in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- What this is for
-- ----------------------------------------------------------------------------
-- A VIP account's cash movements are settled against the companion M-Pesa clone
-- app instead of PayHero, so a deposit can be shown landing on a handset in the
-- room. Each VIP gets **their own** wallet: the admin sets a PIN and an opening
-- balance from the console, the customer types that PIN into the clone once,
-- and from then on that handset is bound to that account.
--
-- The PIN is therefore the link between the two apps, and it is the only thing
-- the phone knows — it has no Supabase session and no account of its own. On a
-- correct PIN the wallet hands back a `device_token`, which the handset keeps
-- and presents on every later read. So the PIN is typed once and the binding
-- outlives the app being closed.
--
-- On the PIN
-- ----------------------------------------------------------------------------
-- It is stored in plain text, deliberately, and that is safe here for one
-- reason: it is **assigned by an admin, never chosen by the customer**, so it
-- is not and cannot be anyone's real M-Pesa PIN. The console has to be able to
-- read it back to tell the customer what to type. It guards a prop balance in a
-- demo; it is not a credential and must never become one. If this ever gates
-- anything real, it needs hashing and rate limiting first.
--
-- The wallet is a **presentation prop**. Nothing here touches a real balance:
-- real money moves only through cash_events and profiles.live_balance, via the
-- PayHero path that Standard accounts use.
--
-- Privilege model: service_role only. Both tables have RLS enabled and no
-- policies, so `anon` and `authenticated` cannot read or write them at all —
-- the rail's routes reach them under the service key, having checked either the
-- caller's tier or their device token first.
-- ----------------------------------------------------------------------------

-- --- 1. The wallets ----------------------------------------------------------

create table if not exists public.mpesa_demo_wallet (
  user_id       uuid        primary key references auth.users (id) on delete cascade,
  pin           text        not null check (pin ~ '^\d{4}$'),
  device_token  uuid        not null default gen_random_uuid(),
  balance_minor bigint      not null default 0 check (balance_minor >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The phone presents a PIN and nothing else, so a PIN must identify exactly one
-- wallet. Assigning one that is already in use is refused rather than resolved
-- arbitrarily — a handset that linked to the wrong customer would be invisible
-- until it showed the wrong balance on stage.
create unique index if not exists mpesa_demo_wallet_pin_key
  on public.mpesa_demo_wallet (pin);

create unique index if not exists mpesa_demo_wallet_device_token_key
  on public.mpesa_demo_wallet (device_token);

-- --- 2. The statements -------------------------------------------------------

create table if not exists public.mpesa_demo_tx (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users (id) on delete cascade,
  kind                text        not null
    check (kind in ('DEPOSIT', 'WITHDRAWAL', 'AGENT_WITHDRAWAL')),
  title               text        not null,
  subtitle            text        not null default '',
  -- Signed, in cents: negative is money leaving the phone.
  amount_minor        bigint      not null,
  balance_after_minor bigint      not null,
  reference           text        not null,
  created_at          timestamptz not null default now()
);

create index if not exists mpesa_demo_tx_user_created_idx
  on public.mpesa_demo_tx (user_id, created_at desc);

alter table public.mpesa_demo_wallet enable row level security;
alter table public.mpesa_demo_tx     enable row level security;

-- --- 3. Admin: assign a PIN and an opening balance ---------------------------

/*
 * Creates or updates one VIP's wallet.
 *
 * Both fields are optional so the console can change a PIN without disturbing a
 * balance mid-demo, or top a handset up without reissuing a PIN. Creating a
 * wallet requires a PIN, since a wallet no PIN reaches is a wallet no phone can
 * ever link to.
 *
 * The statement is deliberately NOT cleared when a balance is set: an admin
 * correcting an opening figure between rehearsals should not silently destroy
 * the history that explains it. `mpesa_demo_reset` is the one that wipes.
 */
create or replace function public.mpesa_demo_set_wallet(
  p_user    uuid,
  p_pin     text    default null,
  p_balance bigint  default null
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_exists boolean;
  v_row    public.mpesa_demo_wallet;
begin
  select exists (select 1 from public.mpesa_demo_wallet where user_id = p_user)
    into v_exists;

  if p_pin is not null and p_pin !~ '^\d{4}$' then
    raise exception 'BAD_PIN';
  end if;
  if p_balance is not null and p_balance < 0 then
    raise exception 'BAD_BALANCE';
  end if;
  if not v_exists and p_pin is null then
    raise exception 'PIN_REQUIRED';
  end if;

  if v_exists then
    update public.mpesa_demo_wallet
       set pin           = coalesce(p_pin, pin),
           balance_minor = coalesce(p_balance, balance_minor),
           updated_at    = now()
     where user_id = p_user
    returning * into v_row;
  else
    insert into public.mpesa_demo_wallet (user_id, pin, balance_minor)
         values (p_user, p_pin, coalesce(p_balance, 0))
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
exception
  when unique_violation then
    raise exception 'PIN_TAKEN';
end;
$$;

/** Removes a VIP's wallet and statement — unlinks any handset holding its token. */
create or replace function public.mpesa_demo_clear_wallet(p_user uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.mpesa_demo_tx     where user_id = p_user;
  delete from public.mpesa_demo_wallet where user_id = p_user;
  return true;
end;
$$;

-- --- 4. The handset: link by PIN, then read by token -------------------------

/*
 * Exchanges a PIN for a device token.
 *
 * Returns null when no wallet carries that PIN, which the route turns into
 * "wrong PIN" — the same answer whether the PIN is unassigned or simply wrong,
 * so the handset cannot be used to enumerate which PINs exist.
 */
create or replace function public.mpesa_demo_link(p_pin text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.mpesa_demo_wallet;
begin
  select * into v_row from public.mpesa_demo_wallet where pin = p_pin;
  if not found then return null; end if;

  return jsonb_build_object(
    'userId',       v_row.user_id,
    'deviceToken',  v_row.device_token,
    'balanceMinor', v_row.balance_minor
  );
end;
$$;

/** The wallet behind a device token, or null when the token is unknown. */
create or replace function public.mpesa_demo_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.mpesa_demo_wallet;
begin
  select * into v_row from public.mpesa_demo_wallet where device_token = p_token;
  if not found then return null; end if;

  return jsonb_build_object(
    'userId',       v_row.user_id,
    'deviceToken',  v_row.device_token,
    'balanceMinor', v_row.balance_minor
  );
end;
$$;

-- --- 5. Movement -------------------------------------------------------------

/*
 * One movement on one wallet, applied atomically.
 *
 * `for update` on that wallet's row is what makes this safe: the terminal
 * depositing while the phone polls and withdraws would otherwise each read the
 * same balance, and the second write would erase the first. Under the lock the
 * two serialise, and the second one sees the first one's balance.
 *
 * Raises NO_WALLET when the account has none — a VIP the admin has not set up
 * yet — and INSUFFICIENT_FUNDS when the phone cannot cover a debit. The routes
 * map both to something the handset can render.
 */
create or replace function public.mpesa_demo_move(
  p_user      uuid,
  p_kind      text,
  p_amount    bigint,
  p_direction text,
  p_title     text,
  p_subtitle  text,
  p_reference text
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_signed  bigint;
  v_balance bigint;
  v_tx      public.mpesa_demo_tx;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'BAD_AMOUNT';
  end if;
  if p_direction not in ('IN', 'OUT') then
    raise exception 'BAD_DIRECTION';
  end if;

  v_signed := case when p_direction = 'OUT' then -p_amount else p_amount end;

  select balance_minor into v_balance
    from public.mpesa_demo_wallet
   where user_id = p_user
     for update;

  if not found then
    raise exception 'NO_WALLET';
  end if;

  v_balance := v_balance + v_signed;
  if v_balance < 0 then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  update public.mpesa_demo_wallet
     set balance_minor = v_balance,
         updated_at    = now()
   where user_id = p_user;

  insert into public.mpesa_demo_tx (
    user_id, kind, title, subtitle, amount_minor, balance_after_minor, reference
  ) values (
    p_user,
    p_kind,
    p_title,
    coalesce(p_subtitle, ''),
    v_signed,
    v_balance,
    p_reference
  )
  returning * into v_tx;

  return jsonb_build_object(
    'balanceMinor', v_balance,
    'tx',           to_jsonb(v_tx)
  );
end;
$$;

-- --- 6. Reset ----------------------------------------------------------------

/*
 * One wallet back to a chosen balance with an empty statement, for rehearsing:
 * run the demo, reset, run it again in front of the room. The device token is
 * left alone, so the handset stays linked.
 */
create or replace function public.mpesa_demo_reset(
  p_user    uuid,
  p_balance bigint default null
) returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance bigint;
begin
  delete from public.mpesa_demo_tx where user_id = p_user;

  update public.mpesa_demo_wallet
     set balance_minor = coalesce(p_balance, balance_minor),
         updated_at    = now()
   where user_id = p_user
  returning balance_minor into v_balance;

  if not found then raise exception 'NO_WALLET'; end if;

  return v_balance;
end;
$$;

-- --- 7. Privileges -----------------------------------------------------------
-- Nobody but the service role. These functions move a prop balance on the
-- say-so of the caller, and the callers that may ask are route handlers that
-- have already verified the account's tier or the handset's device token.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.mpesa_demo_set_wallet(uuid, text, bigint)',
    'public.mpesa_demo_clear_wallet(uuid)',
    'public.mpesa_demo_link(text)',
    'public.mpesa_demo_by_token(uuid)',
    'public.mpesa_demo_move(uuid, text, bigint, text, text, text, text)',
    'public.mpesa_demo_reset(uuid, bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
