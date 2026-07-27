import { NextResponse, type NextRequest } from "next/server";
import { guard } from "@/lib/admin/guard";
import type { AdminWithdrawal } from "@/lib/admin/types";

/**
 * GET /api/admin/withdrawals — the payout queue.
 *
 * Every withdrawal event, pending first and newest within each group, joined
 * with the requester's profile so the console can show who is being paid
 * without a second round-trip per row.
 */

export const runtime = "nodejs";
// The queue is the thing an admin refreshes to see new requests; never cache.
export const dynamic = "force-dynamic";

interface WithdrawalRow {
  id: string;
  user_id: string;
  amount_minor: number | string;
  status: string;
  phone: string;
  reference: string | null;
  failure_reason: string | null;
  created_at: string;
  settled_at: string | null;
  profiles: { username: string | null; phone: string | null } | null;
}

export async function GET(request: NextRequest) {
  const gate = guard(request);
  if ("error" in gate) return gate.error;

  const { data, error } = await gate.db
    .from("cash_events")
    .select(
      "id, user_id, amount_minor, status, phone, reference, failure_reason, created_at, settled_at, profiles(username, phone)",
    )
    .eq("kind", "WITHDRAWAL")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const withdrawals: AdminWithdrawal[] = (data as unknown as WithdrawalRow[]).map(
    (row) => ({
      id: row.id,
      userId: row.user_id,
      phone: row.phone || (row.profiles?.phone ?? ""),
      username: row.profiles?.username ?? "—",
      amountMinor: String(row.amount_minor ?? 0),
      status:
        row.status === "COMPLETED"
          ? "COMPLETED"
          : row.status === "FAILED"
            ? "FAILED"
            : "PENDING",
      reference: row.reference,
      failureReason: row.failure_reason,
      createdAt: row.created_at,
      settledAt: row.settled_at,
    }),
  );

  // Pending first — the queue is the point of the page.
  withdrawals.sort((a, b) => {
    const aPending = a.status === "PENDING" ? 0 : 1;
    const bPending = b.status === "PENDING" ? 0 : 1;
    return aPending - bPending || b.createdAt.localeCompare(a.createdAt);
  });

  return NextResponse.json({ withdrawals });
}
