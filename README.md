# Meridian

A fixed-time derivatives trading terminal. Dark, dense, square-edged, and built
to be defended in a technical conversation rather than only screenshotted.

```bash
npm install
npm run dev          # http://localhost:3000
```

No database, no Docker, no API keys. The market runs in the browser.

> **Don't run `npm run build` while `npm run dev` is running** — they share
> `.next` and the build will break the dev server. Stop dev first.

---

## Using it

The app is a single route (`/`). First visit shows **Create account**: enter any
Kenyan mobile number (`0712345678`, `712345678`, or `+254712345678` all work) and
a password of 8+ characters. That same pair signs you back in.

You land on a funded **Demo** account with KSh 100,000. Pick a market, set a
stake and expiry, press **Higher** or **Lower**.

---

## What is built

**Phase 1 (this build) — UI and simulation.** Everything runs client-side so the
interface can be developed and demonstrated with zero infrastructure.

- **Market engine** — GBM with mean reversion and jumps, 12 instruments, 4Hz
  ticks, 3 days of backfilled history.
- **Terminal** — streaming candles at 5m/15m/30m/1H, entry lines for open
  positions, watchlist with sparklines, trade ticket, live positions with
  countdown rings, settled history.
- **Contract lifecycle** — place, count down, settle against the price at the
  expiry instant, credit the balance, notify.
- **Auth** — M-Pesa number + password, simulated locally (see the warning below).
- **Account panel** — a right-side slide-over holding balances, session
  performance, instrument detail, account links and log out.
- **Mobile** — a designed small-screen layout, not a reflow: fixed thumb-reach
  trading bar, markets and positions as bottom sheets.

**Phase 2 (written, parked in `backend/`).** A full server implementation —
double-entry ledger, server-authoritative settlement engine, WebSocket feed. It
is excluded from the build and **has not been run**; treat it as a reviewed
design, not tested code. See *Wiring up the backend*.

---

## ⚠️ The auth is a simulation

`src/lib/auth.ts` stores accounts in **localStorage**. Nothing is verified
against a server and anyone with devtools can read or edit it. It exists so the
sign-in flow and session model can be designed — it is **not a security
boundary**, and the sign-in screen says so.

Two things are done properly anyway, because doing them wrong here would teach
the wrong shape to the real implementation:

- Passwords are never stored in any readable form — 16-byte random salt,
  PBKDF2-SHA256 at 210,000 iterations (the OWASP 2023 floor).
- Verification is constant-time, and an unknown number still runs a full
  derivation, so login latency can't be used to enumerate accounts.

When this moves server-side, the derivation moves with it and Argon2id replaces
PBKDF2 (PBKDF2 is used here only because it's what `SubtleCrypto` exposes).

---

## The parts worth reviewing

### Money is never a float

Every amount is a `bigint` of minor units (cents). There is no code path where a
balance, stake or payout is a JavaScript `number`. Rounding happens in exactly
one place — `profitFromStake` in `src/lib/trading.ts` — and floors, so profit
rounds down to the cent rather than the platform leaking a fraction of a cent on
every win.

### Settlement uses the price *at expiry*, not the price *now*

```ts
const closePrice = engine.priceAt(trade.symbol, trade.expiresAt);
```

`priceAt` binary-searches tick history and is stable: asked twice for the same
instant it returns the same answer forever. That makes a settlement re-derivable
and therefore disputable. Settling against "the price when the code got around
to it" would mean a tab that stalled for two seconds decides differently from one
that didn't — the outcome would depend on the observer.

If no price exists at that instant the contract is **voided and refunded**, never
settled against a guess.

### The instrument is a verified coin flip

The engine has no reference to trades and no way to obtain one — it cannot tilt
a tick against a position because it doesn't know positions exist. That's
structural, but it was also measured. Pooled over 24 independent seeds and the
full 3-day history:

| Instrument | 60s contract | 5m contract |
|---|---|---|
| VOL50 | P(up) **49.7%** | **50.1%** |
| VOL100 | **50.7%** | **50.1%** |
| EURUSD | **50.5%** | **49.9%** |

n ≈ 9,600 per cell. The house edge is therefore exactly one number — the payout
rate — and it's printed on the ticket before you commit.

Getting there required fixing two real bugs found by that harness:

- **Step-dependent jumps.** The jump term was sized relative to the integration
  step, so the 30-second warmup injected ~120× the jump variance of a live 250ms
  tick. Backfilled history was visibly wilder than everything after it, and the
  extra variance overwhelmed mean reversion — VOL100 drifted 45.8% from its base.
  Jumps are now sized in absolute time; worst drift is 10.3%.
- **A fairness test that measured nothing.** The first version sampled a single
  53-minute window and reported P(up) = 62.5%. It was measuring that window's
  realised trend, not the process. Any fairness claim has to average over
  independent paths.

### Mean reversion that doesn't distort short contracts

Instruments are anchored with an Ornstein–Uhlenbeck pull whose rate is derived
per instrument from `θ = σ²/(2·band²)`, so a 300%-vol synthetic and EUR/USD both
sit in the same ±5% neighbourhood of their quoted level. A single fixed rate
would pin one rigid and let the other wander to nothing over a weekend.

At the edge of the band the pull over a 60-second contract is under 2% of one
standard deviation of the random term — which is why the fairness numbers above
still land on 50%.

### The colour palette was measured, not chosen

Green/red is exactly the pair that collapses under red-green colour blindness.
Candidates were run through a CVD validator (Machado 2009, severity 1.0):

| Pair | Deuteranopia ΔE | Normal-vision ΔE |
|---|---|---|
| Naive green/red `#2ED3A0`/`#FF5C6C` | 8.3 — on the floor | 34.4 |
| **Shipped `#1FD8A4`/`#FF4757`** | **12.1** | **37.7** |

Target is ΔE ≥ 8 (OKLab ×100). Direction is never carried by colour alone
regardless — every price element also gets a ▲/▼ glyph and a signed number.

The rest of the interface is monochrome on purpose. When almost nothing on screen
is saturated, the one thing that is reads instantly.

### There is no price flash

Deliberately. At four ticks a second a background that pulses green/red never
settles — it reads as a flickering panel behind the number and makes the digits
harder to read. The number changing *is* the signal. Direction is carried where
it's stable enough to be legible: the candles, the position rows, the P&L.

### Numbers are tabular

Every figure uses `font-variant-numeric: tabular-nums`. Proportional digits shift
horizontally as prices tick, which reads as instability. Highest-leverage
typographic decision in the interface, one CSS line.

---

## What this platform deliberately does not do

The reference this was modelled on ran a live "activity feed":

> *System: Mercy has successfully withdrawn KES 13,400. Congratulations! ✅*

That is not a chat — it's generated social proof, and it's the most reliable
marker of a predatory binary-options funnel rather than a broker. It is not
implemented here, and not for reasons of scope: a mocked version would be the
same artefact with a better excuse.

Also, each visible in the code:

- **Ties refund.** A contract closing exactly at entry returns the stake in full.
  Scoring equality as a loss is a silent edge that fires constantly on
  low-precision instruments.
- **Both directions carry identical visual weight.** Neither Higher nor Lower is
  styled as the primary action.
- **The break-even rate is shown**, in the account panel, per instrument. At 86%
  payout you must be right 53.8% of the time just to stay level.
- **Simulated feeds are badged.** Symbols naming real markets (BTCUSD, EURUSD,
  XAUUSD…) carry a **SIM** badge. The synthetic volatility indices don't — a
  synthetic index *is* a published random process, so a generated feed is the
  complete and honest implementation of one.

---

## Architecture

```
src/
  lib/
    market/engine.ts       GBM + OU reversion + step-invariant jumps
    market/instruments.ts  The catalogue
    trading.ts             Contract mechanics — pure, testable, no I/O
    store.ts               Balances, placement, settlement, persistence
    auth.ts                Simulated M-Pesa auth (PBKDF2)
    hooks.ts               React bindings that keep 4Hz out of the render tree
    format.ts              bigint-safe money and price formatting
  components/
    auth/AuthScreen        Create account / sign in
    terminal/              TopBar, AccountPanel, MarketHeader, PriceChart,
                           Watchlist, TradeTicket, Positions, StatsPanel,
                           MobileBar, SettlementDriver
    ui/primitives.tsx      Panel, Button, Badge, Segmented, Stat, Empty
  app/
    page.tsx               The terminal (the only route)
    globals.css            The design system
```

`engine.ts` is isomorphic — no Node or DOM APIs — so the identical model runs in
the browser today and behind the server's `PriceOracle` interface later.

### Performance

12 symbols at 4Hz is 48 updates a second. Three things keep that from becoming 48
re-renders:

- `useAllTicks` coalesces a whole tick round into one state update per frame.
- The chart is mutated imperatively via `series.update()`, never re-rendered.
- Slow-moving derived values (sparklines, trailing change) recompute on their own
  2s cadence in an effect, not during render.

`market()` **throws** if called during server rendering — constructing the engine
on the server would run the full warmup per request and leave a timer running
forever. A loud error keeps it out of render paths.

---

## Wiring up the backend

`backend/` holds the server implementation, written before the pivot to UI-first.

- `backend/prisma/schema.prisma` — double-entry ledger, instruments, trades,
  sessions. Every transaction's entries sum to exactly zero.
- `backend/server/ledger.ts` — the only module permitted to move money.
  Idempotency keys, `SELECT … FOR UPDATE` in sorted order to avoid deadlock.
- `backend/server/engine.ts` — settlement. Decides and persists *first* under a
  conditional `WHERE status = 'OPEN'`, then pays under a trade-derived
  idempotency key, with `recoverUnpaid()` on boot. The reverse ordering has no
  safe recovery.
- `backend/server.ts` — custom Node server hosting Next plus a `ws` server, so
  route handlers and the settlement engine share one oracle instance.

To bring it up:

```bash
cp .env.example .env      # then set AUTH_SECRET
docker compose up -d      # Postgres on :5433
npx prisma db push --schema backend/prisma/schema.prisma
npx tsx backend/prisma/seed.ts
```

You'll also need to restore the removed dependencies (`@prisma/client`, `prisma`,
`bcryptjs`, `jose`, `ws`, `tsx`, `zod`) and drop `"backend"` from `tsconfig.json`'s
`exclude`.

The front-end migration is contained: `placeTrade` and `settleDue` in
`src/lib/store.ts` become network calls, `market()` becomes a WebSocket
subscription, and `src/lib/auth.ts` becomes session-cookie calls. DTO shapes
already match — amounts are minor-unit strings on both sides.

---

## Known gaps

- **Auth is local-only** — see the warning above.
- **No real market data.** By design; the `PriceOracle` interface is the seam.
- **Deposits/withdrawals are not wired.** The button explains this. M-Pesa STK
  push is the obvious next step given the account model.
- **Fonts fetch from Google at build time** via `next/font`. This machine needed
  several retries on a slow connection — self-host before relying on an offline
  build.
- **No test suite.** `src/lib/trading.ts` is pure and written to be directly
  testable; `decide`, `pnlFor`, `returnFor`, `profitFromStake` are the four to
  cover first. The engine harness used for the fairness table above was a
  throwaway — worth making permanent.

---

## Commands

```bash
npm run dev         # dev server
npm run build       # production build (stop dev first)
npm run start       # serve the production build
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
```
