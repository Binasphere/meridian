# Meridian — Feature TODO

Tracking the changes requested. Order is roughly dependency-first, but each item
is self-contained.

## Decisions (confirmed with product owner)
- **Accounts:** keep **Demo** (practice). **Live** now has two tiers:
  **Standard** (baseline instrument payout) and **VIP** (payout bonus + perks).
- **First-deposit bonus:** display-only promo banner (+20% up to KSh 100 on the
  first deposit). No funds credited yet — real crediting comes with Supabase.
- **Candle colours:** dedicated vivid chart palette (really-red / really-green),
  separate from the measured UI directional colours used elsewhere.

## Tasks

- [x] **1. Fix stagnant candles.**
  - Default already 1m; sub-minute intervals feel more alive but 1m was a
    deliberate choice — leave default, document it.
  - Real bug: no resync after the tab is backgrounded. Add a
    `visibilitychange` handler in `PriceChart` that does a full `setData()`
    reload + `scrollToRealTime()` on re-focus.
  - Make the streaming poll reload the whole series (not a single `update()`)
    whenever the latest bar jumps more than one bucket ahead of the last one
    pushed — closes the gap/lurch after a background gap.

- [x] **2. Buy / Sell buttons.** Rename the trade-ticket direction buttons from
  "Higher"/"Lower" to **Buy** (UP) / **Sell** (DOWN). Update toast copy too.

- [x] **3. Minimum deposit KSh 100.** `MIN_DEPOSIT` 50 → 100 (5_000 → 10_000
  minor units) in `CashDialog`.

- [x] **4. Vivid candle colours.** Add `--color-candle-up` / `--color-candle-down`
  vivid vars; `PriceChart` reads those for candle bodies/wicks/borders.

- [x] **5. VIP & Standard live tiers.**
  - `liveTier: "STANDARD" | "VIP"` in the session store (persisted).
  - VIP applies a payout bonus to the effective payout used by the ticket +
    settlement.
  - Tier badge + switcher surfaced in the account UI.

- [x] **6. Username at registration.** Add a username field to the register form,
  persist it on `StoredAccount`, validate it, show it in the account panel.

- [x] **7. First-deposit bonus banner.** Show the promo in the deposit dialog when
  no completed deposit exists yet.

- [x] **8. Supabase backend scaffolding.** Install `@supabase/supabase-js`, add a
  guarded client, `.env.local` template, and a `supabase/schema.sql`. Credentials
  to be supplied later.

- [x] **9. Admin panel.** `/admin`: passcode-gated user list with a Standard/VIP
  tier switch. Every privileged read and write runs server-side in
  `src/app/api/admin/*` under the service-role key, because row-level security
  correctly forbids reading other users' rows from the browser.

- [x] **10. Auth on Supabase.** Sign-up and sign-in run against Supabase Auth.
  The Kenyan number is carried as the auth identity via
  `identityEmail()` in `src/lib/phone.ts` (`254712345678@meridian.invalid`), so
  the customer still signs in with a number and a password — no SMS provider, no
  one-time code, no UX change. Creation goes through `POST /api/auth/register`,
  which uses the service role to create the user *pre-confirmed*: the project has
  email confirmation on, and the derived address is on a reserved domain that can
  never receive mail, so a browser `signUp` would strand the account. Sign-in is
  a plain client-side `signInWithPassword`. `src/lib/auth.ts` keeps the
  localStorage simulation as the fallback for when Supabase is unconfigured.

- [x] **11. Tier is server-owned; withdrawals are VIP-only.**
  - The customer-facing tier switcher in `AccountPanel` is gone. `store.setLiveTier`
    became `syncLiveTier`, called only by `auth.ts` when a profile is read, so
    `profiles.live_tier` is the single source and the admin console is the only
    writer. Customers see their tier; they cannot set it.
  - Withdraw is disabled on Standard and enabled on VIP, at all three buttons
    (account panel, wallet balances, wallet movements) and again inside
    `store.requestWithdrawal` — a disabled control is a courtesy, not a control.
    The rule itself is `canWithdraw()` in `trading.ts`.
  - The tier is re-read when the tab regains focus, so an admin upgrade lands
    without the customer signing out and back in.

## Follow-ups
- Persist balances / deposits / trades to Supabase tables. Balances still live in
  `store.ts` (localStorage), so the figure in the terminal is not the one
  `profiles.demo_balance` / `live_balance` holds and the admin console shows.
- Withdrawals are still simulated in `store.ts`. When they become real, the
  VIP check has to move to the server too — the client-side one is a UI
  affordance, not an authorisation boundary.
- Actually credit the first-deposit bonus server-side.
- Admin panel, once real auth exists: replace the shared passcode with an
  `is_admin` flag on `profiles` — `src/lib/admin/guard.ts` is the single place
  that changes — and add an audit trail of tier changes.
