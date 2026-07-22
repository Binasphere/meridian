import { Prisma, type AccountKind, type LedgerTxKind } from "@prisma/client";
import { prisma } from "./db";

/**
 * The ledger.
 *
 * This is the only module in the codebase permitted to change an account
 * balance. Nothing else writes `Account.balanceMinor` and nothing else inserts
 * a `LedgerEntry`. Concentrating it here is what makes the system's central
 * invariant checkable in one place instead of argued about across a dozen call
 * sites.
 */

export class InsufficientFunds extends Error {
  constructor(
    readonly accountId: string,
    readonly availableMinor: bigint,
    readonly requiredMinor: bigint,
  ) {
    super("Insufficient funds");
    this.name = "InsufficientFunds";
  }
}

export interface Posting {
  accountId: string;
  /** Signed minor units: positive credits, negative debits. */
  amountMinor: bigint;
}

export interface PostOptions {
  kind: LedgerTxKind;
  /** Must be unique and derived from the operation, not random. */
  idempotencyKey: string;
  postings: Posting[];
  memo?: string;
  metadata?: Prisma.InputJsonValue;
  /**
   * Accounts that may not go negative. System accounts (HOUSE, GATEWAY) are
   * intentionally allowed to, since the house's book is a liability position
   * and a clearing account is negative by construction.
   */
  requireNonNegative?: string[];
}

export interface PostedTransaction {
  id: string;
  /** Balances after this transaction, keyed by account id. */
  balances: Map<string, bigint>;
  /** True when the idempotency key had already been used and nothing moved. */
  replayed: boolean;
}

/**
 * Posts one balanced transaction atomically.
 *
 * Guarantees, all of which hold under concurrent callers:
 *
 *   - **Balanced.** Postings must sum to zero, checked before any write.
 *   - **Atomic.** Entries and the cached balances commit together or not at all.
 *   - **Idempotent.** A repeated `idempotencyKey` returns the original
 *     transaction without moving money a second time.
 *   - **Serialised per account.** Accounts are locked with `SELECT … FOR UPDATE`
 *     in a deterministic order (sorted by id), so two concurrent transactions
 *     touching the same pair of accounts cannot deadlock and cannot interleave
 *     a read-modify-write on a balance.
 */
export async function post(options: PostOptions): Promise<PostedTransaction> {
  const { kind, idempotencyKey, postings, memo, metadata } = options;
  const requireNonNegative = new Set(options.requireNonNegative ?? []);

  if (postings.length < 2) {
    throw new Error("A transaction needs at least two postings");
  }

  const sum = postings.reduce((acc, p) => acc + p.amountMinor, 0n);
  if (sum !== 0n) {
    throw new Error(
      `Unbalanced transaction: postings sum to ${sum}, expected 0`,
    );
  }

  // Merge duplicate postings against the same account so an account is locked
  // and written exactly once per transaction.
  const merged = new Map<string, bigint>();
  for (const p of postings) {
    merged.set(p.accountId, (merged.get(p.accountId) ?? 0n) + p.amountMinor);
  }

  // Deterministic lock order across all callers — the standard defence against
  // deadlock when two transactions touch the same accounts in opposite order.
  const accountIds = [...merged.keys()].sort();

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.ledgerTransaction.findUnique({
        where: { idempotencyKey },
        include: { entries: true },
      });
      if (existing) {
        return {
          id: existing.id,
          balances: new Map(
            existing.entries.map((e) => [e.accountId, e.balanceAfterMinor]),
          ),
          replayed: true,
        };
      }

      // Lock every participating account for the life of the transaction.
      // Prisma has no typed row-lock API, so this is raw — the ids are bound as
      // parameters, never interpolated.
      await tx.$queryRaw`
        SELECT id FROM "Account"
        WHERE id IN (${Prisma.join(accountIds)})
        ORDER BY id
        FOR UPDATE
      `;

      const accounts = await tx.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, balanceMinor: true },
      });

      if (accounts.length !== accountIds.length) {
        throw new Error("One or more accounts in the transaction do not exist");
      }

      const balances = new Map(accounts.map((a) => [a.id, a.balanceMinor]));

      // Validate every posting before writing any of them.
      for (const [accountId, delta] of merged) {
        const next = balances.get(accountId)! + delta;
        if (next < 0n && requireNonNegative.has(accountId)) {
          throw new InsufficientFunds(
            accountId,
            balances.get(accountId)!,
            -delta,
          );
        }
        balances.set(accountId, next);
      }

      const transaction = await tx.ledgerTransaction.create({
        data: {
          kind,
          idempotencyKey,
          memo,
          metadata,
          entries: {
            create: [...merged].map(([accountId, amountMinor]) => ({
              accountId,
              amountMinor,
              balanceAfterMinor: balances.get(accountId)!,
            })),
          },
        },
      });

      await Promise.all(
        [...merged.keys()].map((accountId) =>
          tx.account.update({
            where: { id: accountId },
            data: { balanceMinor: balances.get(accountId)! },
          }),
        ),
      );

      return { id: transaction.id, balances, replayed: false };
    },
    {
      // Serializable would be stricter, but the explicit FOR UPDATE lock above
      // already serialises the only reads this transaction makes decisions on,
      // and ReadCommitted avoids spurious retry storms under load.
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 15_000,
    },
  );
}

/** Resolves a system account, creating it on first use. */
export async function systemAccount(
  kind: Extract<AccountKind, "HOUSE" | "GATEWAY">,
  currency = "KES",
): Promise<{ id: string }> {
  const existing = await prisma.account.findFirst({
    where: { kind, userId: null, currency },
    select: { id: true },
  });
  if (existing) return existing;

  return prisma.account.create({
    data: { kind, currency, userId: null },
    select: { id: true },
  });
}

/**
 * Re-derives every account balance from its entries and reports drift.
 *
 * The cached `balanceMinor` column is an optimisation, and any optimisation
 * that can silently disagree with the source of truth needs a way to prove it
 * doesn't. Run by `npm run audit`, and by the test suite after every scenario.
 */
export async function auditBalances(): Promise<{
  ok: boolean;
  totalMinor: bigint;
  drift: Array<{ accountId: string; cached: bigint; derived: bigint }>;
}> {
  const accounts = await prisma.account.findMany({
    select: { id: true, balanceMinor: true },
  });

  const sums = await prisma.ledgerEntry.groupBy({
    by: ["accountId"],
    _sum: { amountMinor: true },
  });
  const derivedByAccount = new Map(
    sums.map((s) => [s.accountId, s._sum.amountMinor ?? 0n]),
  );

  const drift: Array<{ accountId: string; cached: bigint; derived: bigint }> =
    [];
  let totalMinor = 0n;

  for (const account of accounts) {
    const derived = derivedByAccount.get(account.id) ?? 0n;
    totalMinor += derived;
    if (derived !== account.balanceMinor) {
      drift.push({
        accountId: account.id,
        cached: account.balanceMinor,
        derived,
      });
    }
  }

  // Across a closed double-entry system every entry is matched, so the sum of
  // all balances must be exactly zero. Anything else means an unbalanced write
  // got through.
  return { ok: drift.length === 0 && totalMinor === 0n, totalMinor, drift };
}
