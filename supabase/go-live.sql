-- ============================================================================
-- Meridian — go-live migration: real money movement
-- ============================================================================
--
-- Run AFTER schema.sql, in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- What this adds:
--   1. Payment-provider columns on cash_events (PayHero checkout id, failure
--      reason).
--   2. Atomic wallet functions. supabase-js cannot express
--      `set live_balance = live_balance - x` — and a read-then-write from a
--      route is a race — so every balance movement is a single SQL function
--      that succeeds or fails as one statement.
--   3. The withdrawal queue: a customer raises a request (balance debited at
--      request time, so the same shilling cannot be queued twice); an admin
--      pays it manually via M-Pesa and confirms with the reference, or rejects
--      it and the debit is refunded.
--   4. Live-contract open/settle for signed-in users, so the server balance —
--      the one deposits credit and withdrawals draw on — moves with trading.
--
-- Privilege model:
--   - `authenticated` may call: withdrawal_request, live_trade_open,
--     live_trade_settle. Each derives the user from auth.uid(); no caller can
--     touch another account.
--   - `service_role` only (API routes): deposit_start, deposit_settle,
--     withdrawal_decide. These are the ones that credit money on the say-so of
--     an external event, so no browser may reach them.
-- ----------------------------------------------------------------------------

-- --- 1. cash_events payment columns ----------------------------------------
alter table public.cash_events
  add column if not exists checkout_id    text,
  add column if not exists failure_reason text;

-- The callback looks events up by id (the external_reference we hand PayHero);
-- pending withdrawals are what the admin queue lists.
create index if not exists cash_events_pending_withdrawals_idx
  on public.cash_events (created_at)
  where kind = 'WITHDRAWAL' and status = 'PENDING';

-- --- First-deposit bonus terms ----------------------------------------------
-- +20% of the first completed deposit, figured on at most KSh 500 — i.e. a cap
-- of KSh 100 (10,000 minor units). Matches the promo in CashDialog; enforced
-- here, once per account, where the client cannot award it to itself.

-- --- 2 & 3. Deposits ---------------------------------------------------------

-- Creates the PENDING deposit row. Service-role only: the route has already
-- authenticated the user from their access token.
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
  if p_amount is null or p_amount <= 0 then
    raise exception 'BAD_AMOUNT';
  end if;

  insert into public.cash_events (user_id, kind, amount_minor, status, phone)
  values (p_user, 'DEPOSIT', p_amount, 'PENDING', p_phone)
  returning id into v_id;

  return v_id;
end;
$$;

-- Records the checkout id PayHero returned, for the audit trail and so the
-- callback can be cross-checked against it.
create or replace function public.deposit_mark_sent(
  p_event    uuid,
  p_checkout text
) returns void
language sql
security definer set search_path = public
as $$
  update public.cash_events
     set checkout_id = p_checkout
   where id = p_event and kind = 'DEPOSIT' and status = 'PENDING';
$$;

-- Settles a deposit from the PayHero callback. Idempotent: a second callback
-- for the same event finds it no longer PENDING and does nothing, so a retried
-- webhook can never credit twice. The amount credited is the amount *we*
-- recorded at initiation — never a figure from the callback body.
create or replace function public.deposit_settle(
  p_event   uuid,
  p_success boolean,
  p_reference text,
  p_failure   text
) returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_event  public.cash_events%rowtype;
  v_bonus  bigint := 0;
  v_first  boolean;
begin
  select * into v_event
    from public.cash_events
   where id = p_event and kind = 'DEPOSIT' and status = 'PENDING'
     for update;

  if not found then
    return false;
  end if;

  if not p_success then
    update public.cash_events
       set status = 'FAILED',
           failure_reason = coalesce(p_failure, 'Payment failed'),
           settled_at = now()
     where id = v_event.id;
    return true;
  end if;

  -- First completed deposit earns the promo bonus: 20% of the amount, figured
  -- on at most KSh 500, so at most KSh 100 free.
  select not exists (
           select 1 from public.cash_events
            where user_id = v_event.user_id
              and kind = 'DEPOSIT' and status = 'COMPLETED'
              and id <> v_event.id
         )
    into v_first;

  if v_first then
    v_bonus := least(v_event.amount_minor, 50000) * 20 / 100;
  end if;

  update public.cash_events
     set status = 'COMPLETED',
         reference = p_reference,
         bonus_minor = v_bonus,
         settled_at = now()
   where id = v_event.id;

  update public.profiles
     set live_balance = live_balance + v_event.amount_minor + v_bonus
   where id = v_event.user_id;

  return true;
end;
$$;

-- --- Withdrawals -------------------------------------------------------------

-- Raised by the signed-in customer. The debit happens *here*, atomically with
-- the balance check, so two racing requests cannot both pass and the same
-- funds cannot be queued twice while the first request is pending.
create or replace function public.withdrawal_request(
  p_amount bigint
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_phone text;
  v_id    uuid;
begin
  if v_user is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if p_amount is null or p_amount < 10000 then  -- KSh 100 minimum
    raise exception 'BAD_AMOUNT';
  end if;

  update public.profiles
     set live_balance = live_balance - p_amount
   where id = v_user and live_balance >= p_amount
   returning phone into v_phone;

  if not found then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  insert into public.cash_events (user_id, kind, amount_minor, status, phone)
  values (v_user, 'WITHDRAWAL', p_amount, 'PENDING', v_phone)
  returning id into v_id;

  return v_id;
end;
$$;

-- The admin's verdict, after paying (or declining to pay) manually via M-Pesa.
-- Approve records the M-Pesa reference; reject refunds the held funds.
-- Idempotent for the same reason deposit_settle is.
create or replace function public.withdrawal_decide(
  p_event     uuid,
  p_approve   boolean,
  p_reference text,
  p_reason    text
) returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_event public.cash_events%rowtype;
begin
  select * into v_event
    from public.cash_events
   where id = p_event and kind = 'WITHDRAWAL' and status = 'PENDING'
     for update;

  if not found then
    return false;
  end if;

  if p_approve then
    update public.cash_events
       set status = 'COMPLETED',
           reference = p_reference,
           settled_at = now()
     where id = v_event.id;
  else
    update public.cash_events
       set status = 'FAILED',
           failure_reason = coalesce(p_reason, 'Request declined'),
           settled_at = now()
     where id = v_event.id;

    update public.profiles
       set live_balance = live_balance + v_event.amount_minor
     where id = v_event.user_id;
  end if;

  return true;
end;
$$;

-- --- 4. Live contracts -------------------------------------------------------

-- Opens a live contract: debits the stake and books the trade in one
-- transaction. The payout is clamped to the best rate the product actually
-- offers (90% base + 2% VIP), so a tampered client cannot book itself a
-- richer contract than the terminal can.
--
-- KNOWN LIMIT, stated plainly: settlement below trusts the *client's* verdict
-- on the outcome, because the price feed still lives in the browser. The
-- exposure is bounded — the credit is computed here from the stake and the
-- clamped payout, never taken from the caller — but a tampered client could
-- report wins it did not earn. The manual admin review on every withdrawal is
-- the human backstop. Before scale, settlement must move to a server that
-- reads its own price feed; see TODO.md.
create or replace function public.live_trade_open(
  p_symbol     text,
  p_direction  trade_direction,
  p_stake      bigint,
  p_payout_bps integer,
  p_open_price double precision,
  p_duration   integer
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if p_stake is null or p_stake <= 0 then
    raise exception 'BAD_AMOUNT';
  end if;
  if p_payout_bps is null or p_payout_bps < 0 or p_payout_bps > 9200 then
    raise exception 'BAD_PAYOUT';
  end if;
  if p_duration is null or p_duration <= 0 or p_duration > 120 then
    raise exception 'BAD_DURATION';
  end if;

  update public.profiles
     set live_balance = live_balance - p_stake
   where id = v_user and live_balance >= p_stake;

  if not found then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  insert into public.trades
    (user_id, account_kind, symbol, direction, status, stake_minor,
     payout_bps, open_price, duration_sec, expires_at)
  values
    (v_user, 'LIVE', p_symbol, p_direction, 'OPEN', p_stake,
     p_payout_bps, p_open_price, p_duration,
     now() + make_interval(secs => p_duration))
  returning id into v_id;

  return v_id;
end;
$$;

-- Settles an expired live contract. The credit is derived here from the row's
-- own stake and payout — the caller supplies a verdict and a close price, and
-- nothing else. Only the owner may settle, only once, and only after expiry.
create or replace function public.live_trade_settle(
  p_trade       uuid,
  p_status      trade_status,
  p_close_price double precision
) returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_trade  public.trades%rowtype;
  v_return bigint;
  v_pnl    bigint;
begin
  if v_user is null then
    raise exception 'NOT_SIGNED_IN';
  end if;
  if p_status not in ('WON', 'LOST', 'TIE', 'VOIDED') then
    raise exception 'BAD_STATUS';
  end if;

  select * into v_trade
    from public.trades
   where id = p_trade and user_id = v_user
     and account_kind = 'LIVE' and status = 'OPEN'
     for update;

  if not found then
    raise exception 'NO_SUCH_OPEN_TRADE';
  end if;

  -- One second of slack for clock skew; earlier than that is not a settlement.
  if now() < v_trade.expires_at - interval '1 second' then
    raise exception 'NOT_EXPIRED';
  end if;

  v_return := case p_status
    when 'WON' then v_trade.stake_minor
                  + v_trade.stake_minor * v_trade.payout_bps / 10000
    when 'LOST' then 0
    else v_trade.stake_minor  -- TIE and VOIDED refund the stake exactly
  end;

  v_pnl := case p_status
    when 'WON'  then v_trade.stake_minor * v_trade.payout_bps / 10000
    when 'LOST' then -v_trade.stake_minor
    else 0
  end;

  update public.trades
     set status = p_status,
         close_price = p_close_price,
         settled_at = now(),
         pnl_minor = v_pnl
   where id = v_trade.id;

  if v_return > 0 then
    update public.profiles
       set live_balance = live_balance + v_return
     where id = v_user;
  end if;

  return v_return;
end;
$$;

-- --- Grants ------------------------------------------------------------------
-- Default execute is granted to public on creation; strip it, then grant each
-- function to exactly the role that may call it.
revoke all on function public.deposit_start(uuid, bigint, text)                          from public, anon, authenticated;
revoke all on function public.deposit_mark_sent(uuid, text)                              from public, anon, authenticated;
revoke all on function public.deposit_settle(uuid, boolean, text, text)                  from public, anon, authenticated;
revoke all on function public.withdrawal_decide(uuid, boolean, text, text)               from public, anon, authenticated;
revoke all on function public.withdrawal_request(bigint)                                 from public, anon;
revoke all on function public.live_trade_open(text, trade_direction, bigint, integer, double precision, integer) from public, anon;
revoke all on function public.live_trade_settle(uuid, trade_status, double precision)    from public, anon;

grant execute on function public.deposit_start(uuid, bigint, text)         to service_role;
grant execute on function public.deposit_mark_sent(uuid, text)             to service_role;
grant execute on function public.deposit_settle(uuid, boolean, text, text) to service_role;
grant execute on function public.withdrawal_decide(uuid, boolean, text, text) to service_role;
grant execute on function public.withdrawal_request(bigint) to authenticated;
grant execute on function public.live_trade_open(text, trade_direction, bigint, integer, double precision, integer) to authenticated;
grant execute on function public.live_trade_settle(uuid, trade_status, double precision) to authenticated;
