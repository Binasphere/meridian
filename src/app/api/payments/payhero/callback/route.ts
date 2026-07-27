import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  callbackSucceeded,
  verifyCallback,
  type PayHeroCallback,
} from "@/lib/payments/payhero";

/**
 * POST /api/payments/payhero/callback — where a deposit actually settles.
 *
 * PayHero calls this with the M-Pesa result. Three properties keep an
 * unauthenticated webhook from being a money printer:
 *
 *   - The URL carries an HMAC of the event id (`sig`), minted when the push
 *     was raised. A customer who knows their own pending event id still cannot
 *     forge a confirmation, because they cannot sign it.
 *   - The amount credited is the amount recorded at initiation. Nothing in
 *     this payload can change what a deposit is worth.
 *   - `deposit_settle` is idempotent: a retried or duplicated webhook finds
 *     the event already settled and does nothing.
 *
 * Always answers 200 with a body PayHero can log; a webhook that 500s gets
 * retried into the same idempotent function anyway.
 */

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json({ ok: false, error: "unconfigured" });
  }

  const id = request.nextUrl.searchParams.get("id") ?? "";
  const sig = request.nextUrl.searchParams.get("sig") ?? "";

  if (!id || !sig || !verifyCallback(id, sig)) {
    return NextResponse.json({ ok: false, error: "bad signature" });
  }

  const payload = (await request.json().catch(() => ({}))) as PayHeroCallback;
  const inner = payload.response ?? {};

  // The signed id in the URL is authoritative; a payload naming a different
  // event is a mismatch we refuse rather than reconcile.
  if (inner.ExternalReference && inner.ExternalReference !== id) {
    return NextResponse.json({ ok: false, error: "reference mismatch" });
  }

  const success = callbackSucceeded(payload);

  await db.rpc("deposit_settle", {
    p_event: id,
    p_success: success,
    p_reference: inner.MpesaReceiptNumber ?? null,
    p_failure: success ? null : (inner.ResultDesc ?? "Payment failed"),
  });

  return NextResponse.json({ ok: true });
}
