import { NextResponse, type NextRequest } from "next/server";
import { guard } from "@/lib/admin/guard";

/**
 * PATCH /api/admin/withdrawals/:id — decide a pending request.
 *
 *   { "action": "PAID", "reference": "SJ42K9L1MN" }  — money was sent via
 *     M-Pesa by hand; record the receipt and close the request.
 *   { "action": "REJECT", "reason": "…" }            — decline; the held funds
 *     go back onto the customer's balance.
 *
 * The route only relays the verdict. The money movement — marking the event
 * and, on rejection, the refund — happens inside `withdrawal_decide`, a single
 * SQL function, so no partial outcome (event closed but hold kept, or refunded
 * twice) is reachable from here. A request that is no longer PENDING answers
 * 409: two admins racing on one row means the second one's click changes
 * nothing, and is told so.
 */

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = guard(request);
  if ("error" in gate) return gate.error;

  const { id } = await context.params;

  let body: { action?: unknown; reference?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "PAID" && action !== "REJECT") {
    return NextResponse.json(
      { error: "action must be PAID or REJECT" },
      { status: 400 },
    );
  }

  const reference =
    typeof body.reference === "string" ? body.reference.trim() : "";
  if (action === "PAID" && !reference) {
    // The reference is the proof the money actually moved; a paid-without-ref
    // row is an unauditable one.
    return NextResponse.json(
      { error: "Enter the M-Pesa reference of the payment" },
      { status: 400 },
    );
  }

  const { data, error } = await gate.db.rpc("withdrawal_decide", {
    p_event: id,
    p_approve: action === "PAID",
    p_reference: action === "PAID" ? reference : null,
    p_reason:
      action === "REJECT" && typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (data !== true) {
    return NextResponse.json(
      { error: "This request has already been decided" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
