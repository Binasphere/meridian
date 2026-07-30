import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { railJson, railPreflight, requireHandset } from "@/lib/server/mpesaRail";
import { NoDemoWallet, readDemoWallet } from "@/lib/server/mpesaWallet";

/**
 * GET /api/mpesa/account — everything the demo phone renders.
 *
 * The phone has no account of its own: it shows the VIP customer whose PIN was
 * typed into it. Which one that is comes from the device token it presents, so
 * two handsets in the same room read two different wallets and neither can ask
 * for the other's.
 *
 * The identity comes from `profiles` and the money from that customer's demo
 * wallet. Nothing here reads or writes a real balance beyond displaying the
 * trading one the customer already sees on their own terminal.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return railPreflight();
}

/**
 * `254702248984` -> `0702248984`.
 *
 * Profiles store the number in the international form the payment provider
 * needs; the handset shows the local one its owner would recognise.
 */
function localPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return `0${digits.slice(3)}`;
  return phone;
}

/** "Deon Orina" -> first/last/DO; a single word gets a blank surname. */
function splitName(username: string | null, phone: string) {
  const cleaned = (username ?? "").trim();
  if (!cleaned) {
    return { firstName: "M-PESA", lastName: "Customer", initials: phone.slice(-2) };
  }

  const parts = cleaned.split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");
  const initials = (
    (firstName[0] ?? "") + (lastName[0] ?? firstName[1] ?? "")
  ).toUpperCase();

  return { firstName, lastName, initials };
}

export async function GET(request: NextRequest) {
  const db = supabaseAdmin();
  if (!db) {
    return railJson(
      { error: "Demo rail unavailable — Supabase is not configured." },
      503,
    );
  }

  const gate = await requireHandset(request);
  if ("response" in gate) return gate.response;
  const { userId } = gate.wallet;

  let wallet;
  try {
    wallet = await readDemoWallet(userId);
  } catch (cause) {
    if (cause instanceof NoDemoWallet) {
      return railJson({ error: cause.message, code: "NOT_LINKED" }, 401);
    }
    return railJson({ error: "Could not read the demo wallet" }, 503);
  }

  const { data: profile } = await db
    .from("profiles")
    .select("phone, username, live_tier, live_balance")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.phone) {
    return railJson({ linked: false, profile: null, ...wallet });
  }

  return railJson({
    linked: true,
    // No tier in the payload. The handset has no use for it, and a field that
    // names the customer's classification is one devtools away from being seen
    // by the customer.
    profile: {
      phone: localPhone(profile.phone),
      ...splitName(profile.username, profile.phone),
    },
    tradingBalanceMinor: Number(profile.live_balance ?? 0),
    ...wallet,
  });
}
