import { type NextRequest } from "next/server";
import {
  railJson,
  railPreflight,
  readAmountMinor,
  requireVipCaller,
} from "@/lib/server/mpesaRail";
import {
  InsufficientDemoFunds,
  demoReference,
  moveDemoFunds,
} from "@/lib/server/mpesaWallet";

/**
 * POST /api/mpesa/deposit — VIP deposit, settled against the demo phone.
 *
 * Where the Standard path raises a real STK push and waits for PayHero's
 * callback, this debits the demo wallet and settles immediately: the money
 * leaves the phone and lands in the live balance in one round trip, which is
 * the whole point of demonstrating it side by side.
 *
 * The debit happens first. If booking or settling the deposit then fails the
 * phone is refunded, so a failure cannot leave the demo down a balance it
 * never traded with.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_DEPOSIT_MINOR = 10_000; // KSh 100, matching the dialog.

export function OPTIONS() {
  return railPreflight();
}

export async function POST(request: NextRequest) {
  const gate = await requireVipCaller(request);
  if ("response" in gate) return gate.response;
  const { db, userId, phone } = gate.caller;

  const parsed = await readAmountMinor(request, MIN_DEPOSIT_MINOR);
  if ("response" in parsed) return parsed.response;
  const { amountMinor } = parsed;

  const reference = demoReference();

  // --- Take it off the phone ----------------------------------------------
  let balanceMinor: number;
  try {
    const { state } = await moveDemoFunds({
      kind: "DEPOSIT",
      amountMinor,
      direction: "OUT",
      title: "Pay to Meridian",
      subtitle: "Trading deposit",
      reference,
    });
    balanceMinor = state.balanceMinor;
  } catch (cause) {
    if (cause instanceof InsufficientDemoFunds) {
      return railJson(
        { error: "You do not have enough money in your M-PESA account." },
        400,
      );
    }
    return railJson({ error: "Could not reach your M-PESA account" }, 500);
  }

  const refund = () =>
    moveDemoFunds({
      kind: "DEPOSIT",
      amountMinor,
      direction: "IN",
      title: "Reversal — Meridian",
      subtitle: "Deposit could not be completed",
    }).catch(() => undefined);

  // --- Put it on the live balance -----------------------------------------
  const { data: eventId, error: startError } = await db.rpc("deposit_start", {
    p_user: userId,
    p_amount: amountMinor,
    p_phone: phone,
  });

  if (startError || typeof eventId !== "string") {
    await refund();
    return railJson({ error: "Could not start the deposit" }, 500);
  }

  const { data: settled, error: settleError } = await db.rpc("deposit_settle", {
    p_event: eventId,
    p_success: true,
    p_reference: reference,
    p_failure: null,
  });

  if (settleError || settled !== true) {
    await db.rpc("deposit_settle", {
      p_event: eventId,
      p_success: false,
      p_reference: null,
      p_failure: "Demo rail could not settle",
    });
    await refund();
    return railJson({ error: "Could not complete the deposit" }, 500);
  }

  return railJson({ id: eventId, reference, balanceMinor });
}
