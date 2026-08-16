import { type NextRequest } from "next/server";
import {
  callerDomain,
  railJson,
  railPreflight,
  requireVipCaller,
} from "@/lib/server/mpesaRail";
import {
  NoDemoWallet,
  demoReference,
  moveDemoFunds,
} from "@/lib/server/mpesaWallet";

/**
 * POST /api/mpesa/withdraw — pays a VIP withdrawal onto the demo phone.
 *
 * The request itself is raised by the browser through `withdrawal_request`,
 * which debits the live balance and books a PENDING event atomically. This
 * route is the payout half: on the Standard path an admin sends the money by
 * hand and records the reference, and on the demo rail the phone plays that
 * part — the funds appear on it and the event is approved with the same
 * `withdrawal_decide` the console uses.
 *
 * The body carries only the event id. Amount and recipient are read from the
 * booked row, never from the request, so the caller cannot ask to be paid more
 * than they queued.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return railPreflight();
}

export async function POST(request: NextRequest) {
  const gate = await requireVipCaller(request);
  if ("response" in gate) return gate.response;
  const { db, userId } = gate.caller;

  let eventId: string;
  try {
    const body = (await request.json()) as { eventId?: unknown };
    eventId = String(body.eventId ?? "");
  } catch {
    return railJson({ error: "Malformed request body" }, 400);
  }
  if (!eventId) return railJson({ error: "Missing withdrawal id" }, 400);

  const { data: event } = await db
    .from("cash_events")
    .select("id, user_id, kind, status, amount_minor")
    .eq("id", eventId)
    .maybeSingle();

  if (!event || event.user_id !== userId) {
    return railJson({ error: "Withdrawal not found" }, 404);
  }
  if (event.kind !== "WITHDRAWAL" || event.status !== "PENDING") {
    return railJson({ error: "That withdrawal is no longer pending" }, 409);
  }

  const amountMinor = Number(event.amount_minor);
  const reference = demoReference();

  // --- Money onto the phone ------------------------------------------------
  let state;
  try {
    ({ state } = await moveDemoFunds({
      userId,
      kind: "WITHDRAWAL",
      amountMinor,
      direction: "IN",
      title: `Receive from ${callerDomain(request)}`,
      subtitle: "Trading withdrawal",
      reference,
    }));
  } catch (cause) {
    if (cause instanceof NoDemoWallet) {
      return railJson({ error: cause.message }, 409);
    }
    return railJson({ error: "Could not reach your M-PESA account" }, 500);
  }

  // --- Approve the request -------------------------------------------------
  const { data: decided, error } = await db.rpc("withdrawal_decide", {
    p_event: eventId,
    p_approve: true,
    p_reference: reference,
    p_reason: null,
  });

  if (error || decided !== true) {
    // The payout never happened, so take it back off the phone rather than
    // leave the demo showing money against a request still in the queue.
    await moveDemoFunds({
      userId,
      kind: "WITHDRAWAL",
      amountMinor,
      direction: "OUT",
      title: `Reversal — ${callerDomain(request)}`,
      subtitle: "Withdrawal could not be completed",
    }).catch(() => undefined);

    return railJson({ error: "Could not complete the withdrawal" }, 500);
  }

  return railJson({ reference, balanceMinor: state.balanceMinor });
}
