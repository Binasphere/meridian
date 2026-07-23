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

## Follow-ups (after Supabase credentials arrive)
- Move auth from localStorage simulation to Supabase Auth.
- Persist accounts / deposits / trades to Supabase tables.
- Actually credit the first-deposit bonus server-side.
