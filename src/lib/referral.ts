"use client";

import { supabase } from "./supabase/client";

const KEY = "venti.ref";

/**
 * Remembers a `?ref=CODE` from the link someone arrived on, so the code is
 * still there when they sign up a few pages (or a Google round trip) later.
 */
export function captureReferral(): void {
  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code && /^[A-Za-z0-9]{4,12}$/.test(code)) {
      localStorage.setItem(KEY, code.toUpperCase());
    }
  } catch {
    // Storage blocked: the referral is simply not recorded.
  }
}

export function pendingReferral(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export interface ReferralStats {
  code: string;
  joined: number;
  funded: number;
}

/** The signed-in customer's own code and counts. */
export async function myReferrals(): Promise<ReferralStats | null> {
  const db = supabase();
  if (!db) return null;
  const { data, error } = await db.rpc("my_referrals");
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return null;
  return { code: row.code, joined: Number(row.joined), funded: Number(row.funded) };
}
