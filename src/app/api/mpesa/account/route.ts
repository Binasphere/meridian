import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { railJson, railPreflight } from "@/lib/server/mpesaRail";
import { readDemoWallet } from "@/lib/server/mpesaWallet";

/**
 * GET /api/mpesa/account — everything the demo phone renders.
 *
 * The phone has no account of its own: it shows the VIP customer this demo is
 * running for. So the identity comes from `profiles` (the VIP row, or the one
 * named by `?phone=`) and the money comes from the demo wallet file.
 *
 * Open on the LAN by design — the phone app has no Supabase session. What it
 * exposes is the demo account's number and a prop balance; nothing here reads
 * or writes a real balance, and no other profile is reachable through it.
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
  const wallet = await readDemoWallet();
  const db = supabaseAdmin();

  // The wallet stands on its own — an unconfigured Supabase costs the phone its
  // identity, not its balance.
  if (!db) {
    return railJson({ linked: false, profile: null, ...wallet });
  }

  const wanted = request.nextUrl.searchParams.get("phone");

  let query = db
    .from("profiles")
    .select("phone, username, live_tier, live_balance")
    .order("created_at", { ascending: true })
    .limit(1);

  query = wanted ? query.eq("phone", wanted) : query.eq("live_tier", "VIP");

  const { data: profile } = await query.maybeSingle();

  if (!profile?.phone) {
    return railJson({ linked: false, profile: null, ...wallet });
  }

  return railJson({
    linked: true,
    profile: {
      phone: localPhone(profile.phone),
      liveTier: profile.live_tier,
      ...splitName(profile.username, profile.phone),
    },
    tradingBalanceMinor: Number(profile.live_balance ?? 0),
    ...wallet,
  });
}
