# Going live — deposits via PayHero, withdrawals via the admin queue

What launches: **Standard accounts, real money.** Deposits are a real M-Pesa
STK push through PayHero and credit `profiles.live_balance` when the callback
confirms. Withdrawals are a request queue: the customer's balance is held the
moment they ask, an admin sees the request at `/admin` → Withdrawals, sends the
money via M-Pesa by hand, and confirms with the M-Pesa reference (or rejects,
which refunds the hold). The old VIP-only withdrawal gate is gone — the manual
review is the control now.

## 1. Database

Run `supabase/go-live.sql` in the Supabase SQL editor (after `schema.sql`,
which is already applied). It is idempotent. It adds the PayHero columns, the
atomic wallet functions, the withdrawal queue functions, and the live-contract
booking/settlement RPCs — including the first-deposit bonus (+20% capped at
KSh 100), now credited for real, server-side, once per account.

The migrations must be applied **in this order**, and `sessions.sql` must be
last:

1. `schema.sql` — tables, RLS, the profile bootstrap trigger
2. `go-live.sql` — real money movement
3. `mpesa-demo.sql` — the VIP demo handsets (skip if you do not use them)
4. `sessions.sql` — the promo live desk

`admins.sql` — the admin accounts table — sits outside this sequence. It
creates one new table and touches nothing that already exists, so it can be run
at any point after `schema.sql` without disturbing the order above.

`sessions.sql` redefines `deposit_start` so that a deposit records which
broadcast was live when it was raised. Re-running `go-live.sql` afterwards
restores the version without that line and every session's takings quietly read
zero — so if you ever re-run it, re-run `sessions.sql` after it.

## 2. Secrets — and the honest answer on "no env"

Everything *public* is already baked into the code (Supabase URL + anon key in
`src/lib/supabase/config.ts`), so the app itself runs with zero configuration.
But going live needs values that are genuinely secret, and **this repository is
public on GitHub** — a secret committed here is harvested by scanners within
minutes. So they cannot be baked in. They can come from either of two places
(env always wins):

| Name | What it is |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API. Powers the admin panel, deposit routes, callback. |
| `ADMIN_PASSCODE` | Your choice. **Bootstrap only** — it creates the first super admin and stops working the moment one exists. See "First sign-in" below. |
| `AUTH_SECRET` | Your choice (any long random string). Signs admin sessions, promo-host sessions and PayHero callback URLs. Unset = the console and the live desk at `/sessions` are both off. |
| `PAYHERO_USERNAME` | PayHero dashboard → API Keys → API Username. |
| `PAYHERO_PASSWORD` | PayHero dashboard → API Keys → API Password. |
| `PAYHERO_CHANNEL_ID` | PayHero dashboard → Payment Channels → My Payment Channels (numeric id of your till/paybill). |
| `PUBLIC_BASE_URL` | Optional. Only needed if the proxy headers don't reveal your public URL; normally leave unset. |

Two ways to provide them:

- **Env vars on the host** (Vercel, Railway, etc.): paste the six values into
  the dashboard once. This is the right choice for any git-push deploy,
  because a gitignored file never reaches the build.
- **`secrets.local.json`** at the repo root (copy `secrets.example.json`):
  works with *no environment at all* — for a VPS or Docker deploy where you
  ship the folder yourself. The file is gitignored; keep it that way.

So: **yes, it can be hosted without configuring env** — via
`secrets.local.json` — as long as you deploy the folder rather than the git
repo. On Vercel-style hosts, use their env dashboard (that is not a `.env`
file in the repo; the repo stays clean either way).

## 2a. First sign-in to `/admin`

The console no longer takes a shared passcode. It takes an account, and the
first account has to come from somewhere:

1. Run `supabase/admins.sql`.
2. Open `/admin`. With no accounts yet and `ADMIN_PASSCODE` set, it offers
   **Set up the console**.
3. Enter the passcode, then your name, a username and a password (10
   characters minimum). That account is a **super admin**.
4. From then on the passcode is refused everywhere. It is not a second way in.

### The three roles

| Role | Can see |
| --- | --- |
| **Super admin** | Everything, plus adding and removing admins |
| **Admin** | Everything except managing admins |
| **Session manager** | The promo desk only — start and end broadcasts, suspend a host. No customers, no balances, no withdrawals, and no money figures even on the sessions they run |

A session manager's console has no Overview, Users or Withdrawals in the
sidebar, and the finance routes refuse their token outright. On the Sessions
page they see durations, depositor counts and sign-ups, but the shilling
figures are **removed from the payload before it is sent** — not hidden in the
browser, which would be one devtools tab away from not being hidden. They can
start a broadcast on a host's behalf, entering the promotion cost; that is an
input they are given, not a figure they are shown.

**`admins.sql` is re-runnable and must be re-run to add this role.** It swaps
the role constraint idempotently, so applying it a second time is safe and is
what allows `SESSION_MANAGER` to exist.

After that, Admins in the sidebar is where a super admin adds colleagues,
suspends them, resets a forgotten password, or changes anyone's role.
Every admin can change their own password there; doing so signs out every other
browser holding that account's session, which is what makes it a real response
to a leak rather than a note about one.

Two things to know before you rely on it:

- **A forgotten password cannot be recovered, only reset**, and only by a
  super admin. The digests are one-way; that is the property you are paying for.
- **If you lose every super admin**, the way back in is at the bottom of
  `supabase/admins.sql` — three lines in the SQL editor that empty the
  super-admin bench and re-open the bootstrap door for whoever holds
  `ADMIN_PASSCODE`. Keep that variable set even after setup for exactly this.

## 3. PayHero

1. Create the API credentials and note the channel id (table above).
2. Deposits need the deployment to be **publicly reachable over HTTPS** —
   PayHero must POST the payment result to
   `/api/payments/payhero/callback`. On `localhost` the push goes out but the
   confirmation can never arrive, so a local deposit will sit pending. The
   callback URL is built per-deposit and signed (HMAC), so there is nothing to
   configure on PayHero's side.

## 4. Smoke test, in order

1. Deploy, sign up with a real Safaricom number, and deposit **KSh 100** (the
   minimum). Approve the STK prompt — balance should credit within seconds,
   plus the KSh 20 first-deposit bonus.
2. Place a live contract; check `/admin` → Users shows the balance moving.
3. Request a withdrawal; check the balance drops immediately and the request
   appears in `/admin` → Withdrawals.
4. Send the payout from your M-Pesa, enter the reference, Mark paid. Then do
   one more request and Reject it — the hold must come back.

## 5. The live desk (`/sessions`)

Staff who market the app on TikTok run their broadcasts from `/sessions`. They
enrol themselves with their full name, mobile number and a password, sign in,
and press Start — entering what they paid to promote the live first, because
that figure is the denominator of everything the broadcast is judged by and a
cost entered afterwards is a cost entered knowing the answer.

While a session is open, every deposit raised is stamped with its id. The host
watches the clock and the takings live; the admin sees all of it at `/admin` →
Sessions and can force-end a broadcast whose host went offline.

To check it works: open `/sessions` in one browser, create a host, start a
session with a spend of KSh 100. In another, deposit as a customer. The host's
Collected figure should move within a poll (about 12 seconds), and the customer
should count as one depositor and one new customer.

Two things worth knowing before you use it in anger:

- **Registration is open.** Anyone who finds the URL can create a host account.
  The controls are Suspend in the console, the fact that only one broadcast runs
  at a time, and the admin's ability to end any of them. If the URL leaks, that
  may not be enough — say so and it becomes an admin-issued invite instead.
- **Demo-handset deposits are excluded** from a session's takings. An account
  wired to the M-Pesa clone settles against a prop wallet, so counting it would
  inflate a host's record with money nobody collected.

## Known limits (read before scale)

- **Contract settlement still trusts the client's verdict.** The stake is
  debited server-side at open and the credit is computed server-side from the
  booked stake and a clamped payout — so the exposure per trade is bounded —
  but a tampered client could report wins it did not earn. The manual review
  on every withdrawal is the human backstop: check the trade history of any
  account whose withdrawals exceed its deposits. Moving settlement behind a
  server price feed is the single most important follow-up.
- Deposit initiation is not rate-limited beyond PayHero's own abuse limits
  (50 failed requests / 6 h restricts the account).
- The admin passcode is shared; replace with per-admin accounts before there
  is more than one admin.
