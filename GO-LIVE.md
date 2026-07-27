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
| `ADMIN_PASSCODE` | Your choice. The `/admin` door; unset = admin panel off. |
| `AUTH_SECRET` | Your choice (any long random string). Signs admin cookies and PayHero callback URLs. Optional but recommended. |
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
