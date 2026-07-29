import { type NextRequest } from "next/server";
import {
  railJson,
  railPreflight,
  requireHandset,
} from "@/lib/server/mpesaRail";
import { NoDemoWallet, resetDemoWallet } from "@/lib/server/mpesaWallet";

/**
 * POST /api/mpesa/reset — put one demo phone back to its opening balance.
 *
 * For rehearsing: run the demo, reset, run it again in front of the room. The
 * handset identifies itself with its device token, so a reset clears that one
 * wallet and leaves every other handset in the room alone. The token itself is
 * untouched, so the phone stays linked.
 *
 * `balanceMinor` in the body sets a specific figure; omit it to keep whatever
 * the balance currently is and only wipe the statement.
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

  let balanceMinor: number | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      balanceMinor?: unknown;
    };
    const wanted = Math.round(Number(body.balanceMinor));
    balanceMinor = Number.isFinite(wanted) && wanted >= 0 ? wanted : undefined;
  } catch {
    balanceMinor = undefined;
  }

  try {
    return railJson(await resetDemoWallet(userId, balanceMinor));
  } catch (cause) {
    if (cause instanceof NoDemoWallet) {
      return railJson({ error: cause.message, code: "NOT_LINKED" }, 401);
    }
    return railJson(
      { error: cause instanceof Error ? cause.message : "Could not reset" },
      503,
    );
  }
}
