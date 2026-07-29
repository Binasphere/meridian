import { railJson, railPreflight } from "@/lib/server/mpesaRail";
import { resetDemoWallet } from "@/lib/server/mpesaWallet";

/**
 * POST /api/mpesa/reset — put the demo phone back to KSh 256,700.
 *
 * For rehearsing: run the demo, reset, run it again in front of the room.
 * Touches the prop wallet file only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return railPreflight();
}

export async function POST() {
  try {
    return railJson(await resetDemoWallet());
  } catch (cause) {
    return railJson(
      { error: cause instanceof Error ? cause.message : "Could not reset" },
      503,
    );
  }
}
