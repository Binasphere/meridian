"use client";

import { MPESA_RAIL_ORIGIN } from "./backend";
import { supabase } from "./supabase/client";
import { refreshWallet, startServerWithdrawal } from "./wallet";
import type { CashEvent, CashStage } from "./store";
import type { LiveTier } from "./trading";

/**
 * The VIP demo rail, from the browser's side.
 *
 * A VIP account's cash movements are settled against the companion M-Pesa
 * phone app instead of PayHero: a deposit takes the money off the handset and
 * credits the live balance in one round trip, and a withdrawal is paid onto
 * the handset immediately rather than queuing for an admin.
 *
 * Standard accounts never come through here — `usesMpesaRail` is the only
 * switch, and it reads the tier the server put on the profile. The routes
 * behind these calls re-check it anyway, because a client-side tier check is a
 * convenience, not a control.
 */

/** Whether this tier is settled against the demo phone. */
export function usesMpesaRail(tier: LiveTier | undefined): boolean {
  return tier === "VIP";
}

async function accessToken(): Promise<string> {
  const db = supabase();
  if (!db) throw new Error("Sign in to continue");
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to continue");
  return token;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${MPESA_RAIL_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await accessToken()}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(json.error ?? "Something went wrong");
  return json;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Deposits from the demo phone.
 *
 * The settlement is one request, so the staged display is paced deliberately:
 * the same four steps a real STK push goes through, held long enough to be
 * read. Nothing is faked about the outcome — the money has genuinely moved off
 * the phone by the time "confirming" appears.
 */
export async function depositFromPhone(
  amountMinor: bigint,
  onStage: (stage: CashStage) => void,
): Promise<{ reference: string; balanceMinor: number }> {
  onStage("REQUESTING");
  await wait(700);
  onStage("AWAITING_CUSTOMER");

  const result = await post<{ id: string; reference: string; balanceMinor: number }>(
    "/api/mpesa/deposit",
    { amountMinor: Number(amountMinor) },
  );

  onStage("CONFIRMING");
  await wait(600);
  await refreshWallet();
  onStage("SETTLED");

  return result;
}

/**
 * Withdraws to the demo phone.
 *
 * Two steps, in this order for a reason: the balance is debited and the event
 * booked by `withdrawal_request` under the customer's own session first, so
 * the funds are committed before anything is paid out. The payout route then
 * approves that specific event.
 */
export async function withdrawToPhone(amountMinor: bigint): Promise<CashEvent> {
  const event = await startServerWithdrawal(amountMinor);

  const { reference } = await post<{ reference: string; balanceMinor: number }>(
    "/api/mpesa/withdraw",
    { eventId: event.id },
  );

  await refreshWallet();

  return { ...event, status: "COMPLETED", stage: "SETTLED", reference };
}
