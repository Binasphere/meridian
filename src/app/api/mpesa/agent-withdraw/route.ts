import { type NextRequest } from "next/server";
import {
  railJson,
  railPreflight,
  requireHandset,
} from "@/lib/server/mpesaRail";
import {
  DemoWalletUnavailable,
  InsufficientDemoFunds,
  NoDemoWallet,
  moveDemoFunds,
} from "@/lib/server/mpesaWallet";

/**
 * POST /api/mpesa/agent-withdraw — the phone's own agent withdrawal.
 *
 * Nothing to do with the trading account: this is the demo phone spending its
 * demo balance at a demo agent. It lives here only so that one wallet remains
 * the single balance both apps read — a withdrawal made on the handset has to
 * be visible the next time the terminal deposits, or the two drift apart
 * mid-demo.
 *
 * Scoped by the handset's device token, so a phone can only ever spend the
 * wallet whose PIN was typed into it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return railPreflight();
}

export async function POST(request: NextRequest) {
  const gate = await requireHandset(request);
  if ("response" in gate) return gate.response;
  const { userId } = gate.wallet;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return railJson({ error: "Malformed request body" }, 400);
  }

  const amountMinor = Math.round(Number(body.amountMinor));
  const chargeMinor = Math.round(Number(body.chargeMinor ?? 0));
  const agentNumber = String(body.agentNumber ?? "");
  const agentName = String(body.agentName ?? "Agent");

  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return railJson({ error: "Enter an amount" }, 400);
  }
  if (!Number.isFinite(chargeMinor) || chargeMinor < 0) {
    return railJson({ error: "Bad charge" }, 400);
  }

  try {
    const { state, tx } = await moveDemoFunds({
      userId,
      kind: "AGENT_WITHDRAWAL",
      amountMinor: amountMinor + chargeMinor,
      direction: "OUT",
      title: `Withdraw from ${agentName}`,
      subtitle: agentNumber ? `Agent ${agentNumber}` : "Agent withdrawal",
    });

    return railJson({
      reference: tx.reference,
      balanceMinor: state.balanceMinor,
      at: tx.at,
    });
  } catch (cause) {
    if (cause instanceof InsufficientDemoFunds) {
      return railJson(
        {
          error:
            "You do not have enough money in your M-PESA account to complete this transaction.",
          code: "INSUFFICIENT_FUNDS",
        },
        400,
      );
    }
    if (cause instanceof NoDemoWallet) {
      return railJson({ error: cause.message, code: "NOT_LINKED" }, 401);
    }
    if (cause instanceof DemoWalletUnavailable) {
      return railJson({ error: cause.message }, 503);
    }
    return railJson({ error: "Could not complete the withdrawal" }, 500);
  }
}
