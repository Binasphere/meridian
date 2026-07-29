import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { railJson, railPreflight } from "@/lib/server/mpesaRail";
import { DemoWalletUnavailable, linkDemoWallet } from "@/lib/server/mpesaWallet";

/**
 * POST /api/mpesa/link — bind this handset to a VIP account.
 *
 * The one route the phone may call before it has been linked. It takes the
 * four-digit PIN the admin assigned in the console and answers with the
 * `deviceToken` for that wallet, which the handset stores and presents on
 * every later request. Typed once, remembered from then on.
 *
 * A wrong PIN and an unissued PIN get the same answer, deliberately: telling
 * them apart would turn this into a way to discover which PINs exist.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return railPreflight();
}

export async function POST(request: NextRequest) {
  const db = supabaseAdmin();
  if (!db) {
    return railJson(
      { error: "Demo rail unavailable — Supabase is not configured." },
      503,
    );
  }

  let pin: string;
  try {
    const body = (await request.json()) as { pin?: unknown };
    pin = String(body.pin ?? "");
  } catch {
    return railJson({ error: "Malformed request body" }, 400);
  }

  let wallet;
  try {
    wallet = await linkDemoWallet(pin);
  } catch (cause) {
    return railJson(
      {
        error:
          cause instanceof DemoWalletUnavailable
            ? cause.message
            : "Could not reach the demo wallet",
      },
      503,
    );
  }

  if (!wallet) {
    return railJson({ error: "Wrong PIN. Please try again.", code: "BAD_PIN" }, 401);
  }

  return railJson({ token: wallet.deviceToken, balanceMinor: wallet.balanceMinor });
}
