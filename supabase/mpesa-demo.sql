-- ============================================================================
-- Venti — the demo M-Pesa wallet
-- ============================================================================
--
-- Run AFTER go-live.sql, in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- What this is for
-- ----------------------------------------------------------------------------
-- A VIP account's cash movements are settled against the companion M-Pesa clone
-- app instead of PayHero, so a deposit can be shown landing on a handset in the
-- room. Both apps have to read one balance or they drift apart mid-demo, and
-- that balance used to be a JSON file on whichever laptop ran `npm run dev`.
--
-- A file cannot survive the demo running anywhere else: a serverless frontend
-- gets a fresh, read-only filesystem per invocation, and Render's disk is wiped
-- on every deploy and cold start. Putting the wallet here means the terminal
-- (local or deployed), the payments service, and the phone all read the same
-- row — and a rehearsal balance survives the fifteen idle minutes before the
-- talk starts.
--
-- This is a **presentation prop**. Nothing here touches a real balance: real
-- money moves only through cash_events and profiles.live_balance, via the
-- PayHero path that Standard accounts use.
--
-- Privilege model: service_role only. Both tables have RLS enabled and no
-- policies, so `anon` and `authenticated` cannot read or write them at all —
-- the rail's routes reach them under the service key, having checked the
-- caller's tier first.
-- ----------------------------------------------------------------------------

-- --- 1. The wallet -----------------------------------------------------------

-- KSh 256,700.00 — where the phone starts before anything is demonstrated.
-- A one-row table: `id` is constrained to true, so a second row cannot exist
-- and every reader can say `where id = true` without ordering or guessing.
create table if not exists public.mpesa_demo_wallet (
  id            boolean primary key default true check (id),
  balance_minor bigint      not null default 25670000,
  updated_at    timestamptz not null default now()
);

insert into public.mpesa_demo_wallet (id) values (true) on conflict (id) do nothing;

-- --- 2. The statement --------------------------------------------------------

create table if not exists public.mpesa_demo_tx (
  id                  uuid        primary key default gen_random_uuid(),
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

create index if not exists mpesa_demo_tx_created_at_idx
  on public.mpesa_demo_tx (created_at desc);

alter table public.mpesa_demo_wallet enable row level security;
alter table public.mpesa_demo_tx     enable row level security;

-- --- 3. Movement -------------------------------------------------------------

/*
 * One movement, applied atomically.
 *
 * `for update` on the singleton row is what makes this safe: the terminal
 * depositing while the phone polls and withdraws would otherwise each read the
 * same balance, and the second write would erase the first. Under the lock the
 * two serialise, and the second one sees the first one's balance.
 *
 * Returns the wallet as it stands afterwards plus the transaction just booked.
 * Raises INSUFFICIENT_FUNDS when the phone cannot cover a debit; the routes map
 * that to a 400 the handset can render.
 */
create or replace function public.mpesa_demo_move(
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

  insert into public.mpesa_demo_wallet (id) values (true) on conflict (id) do nothing;

  select balance_minor into v_balance
    from public.mpesa_demo_wallet
   where id = true
     for update;

  v_balance := v_balance + v_signed;
  if v_balance < 0 then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  update public.mpesa_demo_wallet
     set balance_minor = v_balance,
         updated_at    = now()
   where id = true;

  insert into public.mpesa_demo_tx (
    kind, title, subtitle, amount_minor, balance_after_minor, reference
  ) values (
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

-- --- 4. Reset ----------------------------------------------------------------

/*
 * Back to the opening balance with an empty statement, for rehearsing: run the
 * demo, reset, run it again in front of the room.
 */
create or replace function public.mpesa_demo_reset()
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_start bigint := 25670000;
begin
  delete from public.mpesa_demo_tx;

  insert into public.mpesa_demo_wallet (id, balance_minor)
       values (true, v_start)
  on conflict (id) do update
          set balance_minor = v_start,
              updated_at    = now();

  return v_start;
end;
$$;

-- --- 5. Privileges -----------------------------------------------------------
-- Nobody but the service role. These functions move a prop balance on the
-- say-so of the caller, and the callers that may ask are route handlers that
-- have already verified the account's tier.

revoke all on function public.mpesa_demo_move(text, bigint, text, text, text, text) from public, anon, authenticated;
revoke all on function public.mpesa_demo_reset() from public, anon, authenticated;

grant execute on function public.mpesa_demo_move(text, bigint, text, text, text, text) to service_role;
grant execute on function public.mpesa_demo_reset() to service_role;
