import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { serverSecret } from "@/lib/server/secrets";
import {
  isPayHeroConfigured,
  signCallback,
  stkPush,
} from "@/lib/payments/payhero";

/**
 * POST /api/payments/deposit — raise a real M-Pesa STK push via PayHero.
 *
 * The caller is the signed-in customer; their access token arrives as a Bearer
 * header and is verified against Supabase before anything happens. The push
 * always goes to the *registered* number from `profiles.phone` — the request
 * body carries an amount and nothing else, for the same reason the dialog
 * shows the number read-only: a payment endpoint that accepts an arbitrary
 * phone number is how money ends up prompted on a stranger's handset.
 *
 * The flow it starts is settled by `../payhero/callback`, never by this route:
 * a deposit is credited when M-Pesa says it happened, not when we asked.
 */

export const runtime = "nodejs";

const MIN_DEPOSIT_MINOR = 10_000n; // KSh 100, matching the dialog.

/**
 * The public origin PayHero must call back on. Derived from the proxy headers
 * of the request itself, so no configuration is needed on any host that sets
 * them (all the usual ones do); `PUBLIC_BASE_URL` overrides when a deployment
 * sits somewhere unusual. On localhost the callback URL is unreachable from
 * PayHero's side — real deposits need a public deployment.
 */
function publicOrigin(request: NextRequest): string {
  const configured = serverSecret("PUBLIC_BASE_URL");
  if (configured) return configured.replace(/\/$/, "");

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json(
      { error: "Deposits are unavailable — Supabase is not configured." },
      { status: 503 },
    );
  }
  if (!isPayHeroConfigured()) {
    return NextResponse.json(
      { error: "Deposits are unavailable — payment provider is not configured." },
      { status: 503 },
    );
  }

  // --- Who is asking -------------------------------------------------------
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // --- How much ------------------------------------------------------------
  let amountMinor: bigint;
  try {
    const body = (await request.json()) as { amountMinor?: unknown };
    amountMinor = BigInt(String(body.amountMinor));
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  if (amountMinor < MIN_DEPOSIT_MINOR) {
    return NextResponse.json({ error: "Minimum deposit is KSh 100" }, { status: 400 });
  }
  if (amountMinor % 100n !== 0n) {
    // M-Pesa moves whole shillings; a 50-cent remainder could never settle.
    return NextResponse.json(
      { error: "Deposits must be whole shillings" },
      { status: 400 },
    );
  }

  // --- To which number: always the registered one --------------------------
  const { data: profile } = await db
    .from("profiles")
    .select("phone")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!profile?.phone) {
    return NextResponse.json({ error: "No registered number" }, { status: 400 });
  }

  // --- Book the pending event, then raise the push -------------------------
  const { data: eventId, error: startError } = await db.rpc("deposit_start", {
    p_user: auth.user.id,
    p_amount: Number(amountMinor),
    p_phone: profile.phone,
  });

  if (startError || typeof eventId !== "string") {
    return NextResponse.json(
      { error: "Could not start the deposit" },
      { status: 500 },
    );
  }

  const callbackUrl = `${publicOrigin(request)}/api/payments/payhero/callback?id=${eventId}&sig=${signCallback(eventId)}`;

  const push = await stkPush({
    amountKes: Number(amountMinor / 100n),
    phone: profile.phone,
    reference: eventId,
    callbackUrl,
  });

  if (!push.ok) {
    // The event must not linger as PENDING when no prompt was ever raised.
    await db.rpc("deposit_settle", {
      p_event: eventId,
      p_success: false,
      p_reference: null,
      p_failure: push.error,
    });
    return NextResponse.json({ error: push.error }, { status: 502 });
  }

  if (push.checkoutId) {
    await db.rpc("deposit_mark_sent", {
      p_event: eventId,
      p_checkout: push.checkoutId,
    });
  }

  return NextResponse.json({ id: eventId });
}
