import { PrismaClient, Prisma, type InstrumentKind } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Development seed.
 *
 * Creates the instrument catalogue, the two system accounts, and a small set of
 * demo logins. Everything here is fixture data for a development database — it
 * is not, and must not become, production content.
 */

const prisma = new PrismaClient();

interface InstrumentSeed {
  symbol: string;
  displayName: string;
  kind: InstrumentKind;
  precision: number;
  payoutBps: number;
  basePrice: number;
  volatility: number;
  halfSpread: number;
  sortOrder: number;
}

/**
 * The default catalogue leads with **synthetic indices**, which is a deliberate
 * choice rather than a placeholder. A synthetic index has no underlying market:
 * its price is *defined* by a published random process, so a simulated feed is
 * the honest and complete implementation of it, not a stand-in for real data.
 *
 * The crypto, forex and metals symbols below are also driven by the simulator
 * for now. Because those names refer to real markets whose prices these are
 * not, the terminal renders a persistent "SIMULATED" badge against them, and
 * they are the symbols that flip to real quotes the moment a market-data
 * adapter is configured. Shipping them unlabelled would be lying to the user
 * about what they are looking at.
 */
const INSTRUMENTS: InstrumentSeed[] = [
  // --- Synthetic indices: genuinely synthetic, no underlying market ---------
  { symbol: "VOL10",  displayName: "Volatility 10 Index",  kind: "SYNTHETIC", precision: 3, payoutBps: 8000, basePrice: 6543.21,   volatility: 0.30, halfSpread: 0.05,   sortOrder: 10 },
  { symbol: "VOL25",  displayName: "Volatility 25 Index",  kind: "SYNTHETIC", precision: 3, payoutBps: 8300, basePrice: 3218.44,   volatility: 0.75, halfSpread: 0.04,   sortOrder: 20 },
  { symbol: "VOL50",  displayName: "Volatility 50 Index",  kind: "SYNTHETIC", precision: 3, payoutBps: 8600, basePrice: 9427.430,  volatility: 1.50, halfSpread: 0.08,   sortOrder: 30 },
  { symbol: "VOL75",  displayName: "Volatility 75 Index",  kind: "SYNTHETIC", precision: 3, payoutBps: 8900, basePrice: 128_450.0, volatility: 2.25, halfSpread: 1.2,    sortOrder: 40 },
  { symbol: "VOL100", displayName: "Volatility 100 Index", kind: "SYNTHETIC", precision: 3, payoutBps: 9200, basePrice: 1456.78,   volatility: 3.00, halfSpread: 0.03,   sortOrder: 50 },

  // --- Real-market names, currently on the simulated feed -------------------
  { symbol: "BTCUSD", displayName: "Bitcoin / USD",   kind: "CRYPTO",    precision: 2, payoutBps: 8500, basePrice: 96_480.00, volatility: 0.55, halfSpread: 6.0,     sortOrder: 60 },
  { symbol: "ETHUSD", displayName: "Ethereum / USD",  kind: "CRYPTO",    precision: 2, payoutBps: 8500, basePrice: 3_342.60,  volatility: 0.70, halfSpread: 0.45,    sortOrder: 70 },
  { symbol: "SOLUSD", displayName: "Solana / USD",    kind: "CRYPTO",    precision: 3, payoutBps: 8700, basePrice: 189.240,   volatility: 0.95, halfSpread: 0.035,   sortOrder: 80 },
  { symbol: "XAUUSD", displayName: "Gold / USD",      kind: "COMMODITY", precision: 2, payoutBps: 8200, basePrice: 2_648.35,  volatility: 0.16, halfSpread: 0.22,    sortOrder: 90 },
  { symbol: "EURUSD", displayName: "Euro / USD",      kind: "FOREX",     precision: 5, payoutBps: 8100, basePrice: 1.08540,   volatility: 0.08, halfSpread: 0.00006, sortOrder: 100 },
  { symbol: "GBPUSD", displayName: "Sterling / USD",  kind: "FOREX",     precision: 5, payoutBps: 8100, basePrice: 1.26480,   volatility: 0.09, halfSpread: 0.00007, sortOrder: 110 },
  { symbol: "USDJPY", displayName: "USD / Yen",       kind: "FOREX",     precision: 3, payoutBps: 8100, basePrice: 157.220,   volatility: 0.10, halfSpread: 0.008,   sortOrder: 120 },
];

const DEMO_STARTING_BALANCE_MINOR = 10_000_000n; // KES 100,000.00 of practice money

async function main() {
  console.log("Seeding Meridian…\n");

  // --- Instruments --------------------------------------------------------
  for (const instrument of INSTRUMENTS) {
    await prisma.instrument.upsert({
      where: { symbol: instrument.symbol },
      update: {
        displayName: instrument.displayName,
        kind: instrument.kind,
        precision: instrument.precision,
        payoutBps: instrument.payoutBps,
        basePrice: new Prisma.Decimal(instrument.basePrice),
        volatility: new Prisma.Decimal(instrument.volatility),
        halfSpread: new Prisma.Decimal(instrument.halfSpread),
        sortOrder: instrument.sortOrder,
        isActive: true,
      },
      create: {
        symbol: instrument.symbol,
        displayName: instrument.displayName,
        kind: instrument.kind,
        precision: instrument.precision,
        payoutBps: instrument.payoutBps,
        basePrice: new Prisma.Decimal(instrument.basePrice),
        volatility: new Prisma.Decimal(instrument.volatility),
        drift: new Prisma.Decimal(0),
        halfSpread: new Prisma.Decimal(instrument.halfSpread),
        sortOrder: instrument.sortOrder,
      },
    });
  }
  console.log(`  ${INSTRUMENTS.length} instruments`);

  // --- System accounts ----------------------------------------------------
  for (const kind of ["HOUSE", "GATEWAY"] as const) {
    const existing = await prisma.account.findFirst({
      where: { kind, userId: null, currency: "KES" },
    });
    if (!existing) {
      await prisma.account.create({ data: { kind, currency: "KES" } });
    }
  }
  console.log("  system accounts (HOUSE, GATEWAY)");

  // --- Demo users ---------------------------------------------------------
  const passwordHash = await bcrypt.hash("meridian123", 12);

  const users = [
    { email: "admin@meridian.test", displayName: "Ops Admin", role: "ADMIN" as const },
    { email: "trader@meridian.test", displayName: "Amina K.", role: "USER" as const },
    { email: "second@meridian.test", displayName: "Brian O.", role: "USER" as const },
  ];

  for (const spec of users) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: { displayName: spec.displayName, role: spec.role },
      create: {
        email: spec.email,
        displayName: spec.displayName,
        role: spec.role,
        passwordHash,
        avatarSeed: spec.email,
      },
    });

    // Every user holds one DEMO and one LIVE account.
    for (const kind of ["DEMO", "LIVE"] as const) {
      const existing = await prisma.account.findFirst({
        where: { userId: user.id, kind, currency: "KES" },
      });
      if (existing) continue;

      const account = await prisma.account.create({
        data: { userId: user.id, kind, currency: "KES" },
      });

      // Practice money is issued against the HOUSE account so the books still
      // balance to zero — demo funds are a real liability in the ledger, just
      // one that is never withdrawable.
      if (kind === "DEMO") {
        const house = await prisma.account.findFirstOrThrow({
          where: { kind: "HOUSE", userId: null, currency: "KES" },
        });

        await prisma.$transaction([
          prisma.ledgerTransaction.create({
            data: {
              kind: "DEMO_TOPUP",
              idempotencyKey: `seed-demo-topup:${account.id}`,
              memo: "Initial practice balance",
              entries: {
                create: [
                  {
                    accountId: house.id,
                    amountMinor: -DEMO_STARTING_BALANCE_MINOR,
                    balanceAfterMinor: 0n, // rewritten below
                  },
                  {
                    accountId: account.id,
                    amountMinor: DEMO_STARTING_BALANCE_MINOR,
                    balanceAfterMinor: DEMO_STARTING_BALANCE_MINOR,
                  },
                ],
              },
            },
          }),
          prisma.account.update({
            where: { id: account.id },
            data: { balanceMinor: DEMO_STARTING_BALANCE_MINOR },
          }),
          prisma.account.update({
            where: { id: house.id },
            data: { balanceMinor: { decrement: DEMO_STARTING_BALANCE_MINOR } },
          }),
        ]);
      }
    }
  }
  console.log(`  ${users.length} users (password: meridian123)`);

  // Repair the HOUSE running balances written as 0n above, so the statement
  // view and the audit agree.
  const house = await prisma.account.findFirstOrThrow({
    where: { kind: "HOUSE", userId: null, currency: "KES" },
  });
  const houseEntries = await prisma.ledgerEntry.findMany({
    where: { accountId: house.id },
    orderBy: { createdAt: "asc" },
  });
  let running = 0n;
  for (const entry of houseEntries) {
    running += entry.amountMinor;
    if (entry.balanceAfterMinor !== running) {
      await prisma.ledgerEntry.update({
        where: { id: entry.id },
        data: { balanceAfterMinor: running },
      });
    }
  }

  console.log("\nDone.\n");
  console.log("  Sign in at /login");
  console.log("    admin@meridian.test  / meridian123   (operator console)");
  console.log("    trader@meridian.test / meridian123   (KES 100,000 practice)\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
