import { prisma } from "../db";
import { SimulatedOracle } from "./simulated";
import type { InstrumentSpec, PriceOracle } from "./types";

export * from "./types";

/**
 * Oracle construction and process-wide access.
 *
 * `PRICE_ORACLE=simulated` is the default and needs no network. To attach a
 * real feed, implement `PriceOracle` against the provider and add a branch in
 * `createOracle` — no other file changes, because nothing outside this
 * directory imports a concrete implementation.
 */

const globalForOracle = globalThis as unknown as {
  __meridianOracle: PriceOracle | undefined;
};

async function loadSpecs(): Promise<InstrumentSpec[]> {
  const instruments = await prisma.instrument.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return instruments.map((i) => ({
    symbol: i.symbol,
    displayName: i.displayName,
    precision: i.precision,
    basePrice: Number(i.basePrice),
    volatility: Number(i.volatility),
    drift: Number(i.drift),
    halfSpread: Number(i.halfSpread),
  }));
}

export async function createOracle(): Promise<PriceOracle> {
  const specs = await loadSpecs();
  if (specs.length === 0) {
    throw new Error(
      "No active instruments found. Run `npm run db:seed` before starting the server.",
    );
  }

  const provider = process.env.PRICE_ORACLE ?? "simulated";
  switch (provider) {
    case "simulated": {
      const seed = process.env.ORACLE_SEED
        ? Number(process.env.ORACLE_SEED)
        : undefined;
      return new SimulatedOracle(specs, seed);
    }
    default:
      throw new Error(
        `Unknown PRICE_ORACLE "${provider}". Supported: simulated.`,
      );
  }
}

export function setOracle(oracle: PriceOracle): void {
  globalForOracle.__meridianOracle = oracle;
}

/**
 * The running oracle.
 *
 * Throws rather than returning null: every caller needs a price, and a silent
 * undefined would surface as a mysterious settlement failure much later.
 */
export function oracle(): PriceOracle {
  const instance = globalForOracle.__meridianOracle;
  if (!instance) {
    throw new Error(
      "Price oracle not initialised. The app must be started via `npm run dev` (server.ts), not `next dev`.",
    );
  }
  return instance;
}

export function oracleOrNull(): PriceOracle | null {
  return globalForOracle.__meridianOracle ?? null;
}
