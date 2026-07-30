import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  DemoWalletUnavailable,
  walletByToken,
  type MpesaDemoWallet,
} from "./mpesaWallet";

/**
 * Shared plumbing for the demo M-Pesa rail (`/api/mpesa/*`).
 *
 * Two kinds of caller reach these routes:
 *
 *   - the **terminal**, with the customer's Supabase access token, moving money
 *     between their live balance and their demo phone. `requireVipCaller` gates
 *     that: the token is verified server-side and the tier is read from
 *     `profiles`, never from the request, so a Standard account cannot ask for
 *     the demo rail and a customer cannot promote themselves into it.
 *   - the **phone app**, which has no Supabase session at all. It presents the
 *     `device_token` it was given when its PIN was accepted, and that token is
 *     what says which wallet it may see — see `requireHandset`. Before it has
 *     one it can call `/link` and nothing else.
 */

/** The phone app is a native client on the LAN; permissive CORS keeps the web build working too. */
export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
  "cache-control": "no-store",
};

export function railJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export function railPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export interface VipCaller {
  db: SupabaseClient;
  userId: string;
  phone: string;
  username: string | null;
}

/**
 * Verifies the bearer token and that the account is on the VIP tier.
 *
 * Returns either the caller or the response to send back — callers write
 * `if ("response" in gate) return gate.response;`.
 */
export async function requireVipCaller(
  request: NextRequest,
): Promise<{ caller: VipCaller } | { response: NextResponse }> {
  const db = supabaseAdmin();
  if (!db) {
    return {
      response: railJson(
        { error: "Demo rail unavailable — Supabase is not configured." },
        503,
      ),
    };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { response: railJson({ error: "Not signed in" }, 401) };

  const { data: auth, error } = await db.auth.getUser(token);
  if (error || !auth.user) {
    return { response: railJson({ error: "Not signed in" }, 401) };
  }

  const { data: profile } = await db
    .from("profiles")
    .select("phone, username, live_tier")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!profile) {
    return { response: railJson({ error: "No profile for this account" }, 400) };
  }
  if (profile.live_tier !== "VIP") {
    // Neutral on purpose: the tier is an internal classification and the
    // customer is never told which one they are on, so the refusal must not be
    // the thing that tells them.
    return {
      response: railJson(
        { error: "This payment method is not available on your account." },
        403,
      ),
    };
  }

  return {
    caller: {
      db,
      userId: auth.user.id,
      phone: profile.phone ?? "",
      username: profile.username ?? null,
    },
  };
}

/**
 * Resolves the handset's device token to the wallet it may act on.
 *
 * The token arrives as a bearer header or `?token=`. It is the phone's whole
 * identity: it was issued when the admin-assigned PIN was accepted, and it
 * scopes every read and every agent withdrawal to that one wallet. A handset
 * without one has linked to nothing and is told so.
 */
export async function requireHandset(
  request: NextRequest,
): Promise<{ wallet: MpesaDemoWallet } | { response: NextResponse }> {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    request.nextUrl.searchParams.get("token") ||
    "";

  if (!token) {
    return {
      response: railJson(
        { error: "This phone is not linked yet.", code: "NOT_LINKED" },
        401,
      ),
    };
  }

  let wallet: MpesaDemoWallet | null;
  try {
    wallet = await walletByToken(token);
  } catch (cause) {
    return {
      response: railJson(
        {
          error:
            cause instanceof DemoWalletUnavailable
              ? cause.message
              : "Could not reach the demo wallet",
        },
        503,
      ),
    };
  }

  if (!wallet) {
    // The admin cleared the wallet, or this token belongs to a project the
    // phone is no longer pointed at. Either way it must re-link.
    return {
      response: railJson(
        { error: "This phone is no longer linked.", code: "NOT_LINKED" },
        401,
      ),
    };
  }

  return { wallet };
}

/** Parses `amountMinor` from a request body, in whole shillings. */
export async function readAmountMinor(
  request: NextRequest,
  minimumMinor: number,
): Promise<{ amountMinor: number } | { response: NextResponse }> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { response: railJson({ error: "Malformed request body" }, 400) };
  }

  const amountMinor = Math.round(Number(body.amountMinor));
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { response: railJson({ error: "Enter an amount" }, 400) };
  }
  if (amountMinor < minimumMinor) {
    return {
      response: railJson(
        { error: `Minimum is KSh ${(minimumMinor / 100).toLocaleString()}` },
        400,
      ),
    };
  }
  if (amountMinor % 100 !== 0) {
    return { response: railJson({ error: "Use whole shillings" }, 400) };
  }

  return { amountMinor };
}
