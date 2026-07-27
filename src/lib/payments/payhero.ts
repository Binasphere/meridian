import { createHmac, timingSafeEqual } from "node:crypto";
import { serverSecret } from "@/lib/server/secrets";

/**
 * PayHero (payhero.co.ke) — M-Pesa STK push. **Server only.**
 *
 * Deposits work like this:
 *
 *   1. `POST /api/payments/deposit` books a PENDING cash event and calls
 *      {@link stkPush}. PayHero raises the M-Pesa prompt on the customer's
 *      handset.
 *   2. The customer enters their PIN. PayHero POSTs the result to our callback
 *      URL, which settles the event and credits the balance — or marks it
 *      FAILED.
 *
 * The credentials are the API username/password pair from the PayHero
 * dashboard (Settings → API Keys), sent as HTTP Basic auth. They authorise
 * charges against your PayHero account, so they are secrets and live in
 * `lib/server/secrets.ts`'s two sources, never in this public repository.
 *
 * `PAYHERO_CHANNEL_ID` is the numeric id of the payment channel (your till /
 * paybill) under Payment Channels → My Payment Channels.
 */

const PAYHERO_ENDPOINT = "https://backend.payhero.co.ke/api/v2/payments";

function username(): string {
  return serverSecret("PAYHERO_USERNAME");
}
function password(): string {
  return serverSecret("PAYHERO_PASSWORD");
}
function channelId(): number {
  return Number(serverSecret("PAYHERO_CHANNEL_ID")) || 0;
}

export function isPayHeroConfigured(): boolean {
  return Boolean(username() && password() && channelId());
}

function basicAuth(): string {
  return `Basic ${Buffer.from(`${username()}:${password()}`).toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Callback URL signing
// ---------------------------------------------------------------------------

/**
 * The callback endpoint is necessarily unauthenticated — PayHero is the
 * caller — but it must not be *forgeable*: a customer knows their own pending
 * event id (RLS lets them read their row), and an unsigned callback would let
 * them "confirm" a deposit they never paid. So the URL we hand PayHero carries
 * an HMAC of the event id under a key no customer holds, and the callback
 * route refuses anything whose signature does not verify.
 */
function callbackKey(): string {
  return serverSecret("AUTH_SECRET") || password();
}

export function signCallback(eventId: string): string {
  return createHmac("sha256", callbackKey()).update(eventId).digest("base64url");
}

export function verifyCallback(eventId: string, signature: string): boolean {
  const expected = Buffer.from(signCallback(eventId));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ---------------------------------------------------------------------------
// STK push
// ---------------------------------------------------------------------------

export type StkPushResult =
  | { ok: true; checkoutId: string | null }
  | { ok: false; error: string };

/**
 * Raises the M-Pesa prompt.
 *
 * `amountKes` is whole shillings — PayHero takes integer KES, which is why the
 * deposit route insists the minor-unit amount divides by 100. The phone goes
 * in normalised `2547XXXXXXXX` form; `reference` is our cash-event id and is
 * what the callback hands back as `ExternalReference`.
 */
export async function stkPush(args: {
  amountKes: number;
  phone: string;
  reference: string;
  callbackUrl: string;
}): Promise<StkPushResult> {
  let response: Response;
  try {
    response = await fetch(PAYHERO_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: basicAuth(),
      },
      body: JSON.stringify({
        amount: args.amountKes,
        phone_number: args.phone,
        channel_id: channelId(),
        provider: "m-pesa",
        external_reference: args.reference,
        callback_url: args.callbackUrl,
      }),
      // A hung payment gateway must not hold the route open indefinitely.
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { ok: false, error: "Could not reach the payment provider" };
  }

  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    status?: string;
    CheckoutRequestID?: string;
    error_message?: string;
    message?: string;
  };

  if (!response.ok || body.success === false) {
    return {
      ok: false,
      error:
        body.error_message ??
        body.message ??
        `Payment provider refused the request (${response.status})`,
    };
  }

  return { ok: true, checkoutId: body.CheckoutRequestID ?? null };
}

// ---------------------------------------------------------------------------
// Callback payload
// ---------------------------------------------------------------------------

/** The shape PayHero POSTs to the callback URL. Fields we do not read omitted. */
export interface PayHeroCallback {
  status?: boolean;
  response?: {
    ExternalReference?: string;
    CheckoutRequestID?: string;
    MpesaReceiptNumber?: string;
    ResultCode?: number;
    ResultDesc?: string;
    Status?: string;
  };
}

/** Whether a callback reports a completed payment. */
export function callbackSucceeded(payload: PayHeroCallback): boolean {
  const inner = payload.response;
  return Boolean(
    inner && (inner.ResultCode === 0 || inner.Status === "Success"),
  );
}
