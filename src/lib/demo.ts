/**
 * Demo fixtures.
 *
 * ## Read this before shipping
 *
 * `DEMO_COMMUNITY_ACTIVITY` fabricates other people's trading activity so the
 * activity feed can be shown working in a client demo before there are any real
 * users. It is a **presentation aid**, and it must be `false` in production.
 *
 * The reason this is one flag in one file, rather than sprinkled through the
 * feed component, is that its production value is a decision someone should make
 * deliberately and be able to audit in one place. A fabricated activity stream
 * shown to real depositors as if it were real is the defining mechanic of a
 * binary-options funnel — the thing that makes depositing feel safe by
 * manufacturing evidence that strangers are getting paid. Rendering it to a
 * client who knows it is sample data is fine. Rendering it to a customer is not.
 *
 * The on-screen "sample" badge was removed at the client's request, so there is
 * now **no runtime tell** that this data is fabricated — the console warning
 * below is deliberately loud to compensate, and this flag is the only thing
 * standing between a demo aid and manufactured social proof. Turn it off before
 * this build faces a real customer.
 *
 * One safeguard remains in the data itself: nothing here fabricates
 * *withdrawals* or any cash movement. Money leaving the platform is the specific
 * claim these funnels manufacture, and it is the one claim that should only ever
 * come from a real ledger.
 */
export const DEMO_COMMUNITY_ACTIVITY = true;

if (DEMO_COMMUNITY_ACTIVITY && typeof window !== "undefined") {
  console.warn(
    "%c⚠ DEMO_COMMUNITY_ACTIVITY is ON",
    "background:#fab219;color:#000;font-weight:700;padding:2px 6px",
    "\nThe activity feed is showing fabricated trades by people who do not exist," +
      "\nand there is no longer a badge saying so." +
      "\nSet DEMO_COMMUNITY_ACTIVITY = false in src/lib/demo.ts before production.",
  );
}

/** Display names for sample participants. Obviously placeholder, not personas. */
const DEMO_TRADERS = [
  "A. Kimani",
  "B. Ochieng",
  "C. Wanjiru",
  "D. Mutua",
  "E. Njoroge",
  "F. Chebet",
  "G. Otieno",
  "H. Adhiambo",
  "J. Kiprop",
  "K. Wafula",
] as const;

const DEMO_SYMBOLS = [
  "BTCUSD",
  "ETHUSD",
  "SOLUSD",
  "BNBUSD",
  "XRPUSD",
  "DOGEUSD",
  "ADAUSD",
  "LINKUSD",
  "AVAXUSD",
  "PEPEUSD",
] as const;

export interface DemoActivity {
  id: string;
  at: number;
  actorLabel: string;
  kind: "won" | "lost" | "opened";
  symbol: string;
  amountMinor: bigint;
  direction: "UP" | "DOWN";
}

/** Deterministic PRNG so a demo replays identically across reloads. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

/**
 * Builds a plausible backlog of sample activity ending at `now`.
 *
 * Outcomes are drawn at the true 50/50 the instruments actually pay, not a
 * flattering skew. A sample feed where nine of every ten strangers win is the
 * dishonest version of this even when it is labelled — and it would also
 * misrepresent the product to the client being shown it.
 */
export function buildDemoActivity(count = 14, seed = 20260722): DemoActivity[] {
  const rand = mulberry32(seed);
  const now = Date.now();
  const out: DemoActivity[] = [];

  let cursor = now - 20_000;

  for (let i = 0; i < count; i++) {
    // Stakes cluster at the low end, as real ones do.
    const stakeChoices = [10_000n, 10_000n, 25_000n, 25_000n, 50_000n, 100_000n, 250_000n];
    const stake = pick(rand, stakeChoices);
    const payoutBps = 8000 + Math.floor(rand() * 13) * 100;

    const roll = rand();
    const kind: DemoActivity["kind"] =
      roll < 0.18 ? "opened" : roll < 0.59 ? "won" : "lost";

    out.push({
      id: `demo-${i}`,
      at: cursor,
      actorLabel: pick(rand, DEMO_TRADERS),
      kind,
      symbol: pick(rand, DEMO_SYMBOLS),
      direction: rand() < 0.5 ? "UP" : "DOWN",
      amountMinor:
        kind === "won"
          ? (stake * BigInt(payoutBps)) / 10_000n
          : stake,
    });

    // Space events irregularly backwards in time.
    cursor -= 15_000 + Math.floor(rand() * 180_000);
  }

  return out;
}

/** Milliseconds until the next sample event should appear. */
export function nextDemoInterval(rand: () => number = Math.random): number {
  return 9_000 + Math.floor(rand() * 16_000);
}

/** A single fresh sample event, for the live drip. */
export function makeDemoActivity(seed: number): DemoActivity {
  const rand = mulberry32(seed);
  const stake = pick(rand, [10_000n, 25_000n, 50_000n, 100_000n, 250_000n]);
  const payoutBps = 8000 + Math.floor(rand() * 13) * 100;
  const roll = rand();
  const kind: DemoActivity["kind"] =
    roll < 0.18 ? "opened" : roll < 0.59 ? "won" : "lost";

  return {
    id: `demo-live-${seed}`,
    at: Date.now(),
    actorLabel: pick(rand, DEMO_TRADERS),
    kind,
    symbol: pick(rand, DEMO_SYMBOLS),
    direction: rand() < 0.5 ? "UP" : "DOWN",
    amountMinor:
      kind === "won" ? (stake * BigInt(payoutBps)) / 10_000n : stake,
  };
}
