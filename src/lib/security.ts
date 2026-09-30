"use client";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase/config";
import { supabase } from "./supabase/client";
import { identityEmail, MIN_PASSWORD_LENGTH } from "./phone";

type Result = { ok: true } | { ok: false; reason: string };

/**
 * Changes the password after proving the current one.
 *
 * The check signs in on a throwaway client that never persists, so the real
 * session (and its two-step level) is untouched, then ends only that one.
 */
export async function changePassword(
  phone: string,
  current: string,
  next: string,
): Promise<Result> {
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Use at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  const db = supabase();
  if (!db || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, reason: "Unavailable right now" };
  }

  const probe = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: wrong } = await probe.auth.signInWithPassword({
    email: identityEmail(phone),
    password: current,
  });
  if (wrong) return { ok: false, reason: "Current password is incorrect" };
  await probe.auth.signOut({ scope: "local" });

  const { error } = await db.auth.updateUser({ password: next });
  if (error) return { ok: false, reason: "Could not change the password" };
  return { ok: true };
}

export interface TwoFactorStatus {
  enabled: boolean;
  factorId: string | null;
}

export async function twoFactorStatus(): Promise<TwoFactorStatus> {
  const db = supabase();
  if (!db) return { enabled: false, factorId: null };
  const { data } = await db.auth.mfa.listFactors();
  const factor = data?.totp?.find((f) => f.status === "verified") ?? null;
  return { enabled: Boolean(factor), factorId: factor?.id ?? null };
}

export interface Enrollment {
  factorId: string;
  qr: string;
  secret: string;
}

/** Starts an authenticator-app enrollment; half-finished ones are cleared first. */
export async function startTwoFactor(): Promise<Enrollment | { error: string }> {
  const db = supabase();
  if (!db) return { error: "Unavailable right now" };

  const { data: existing } = await db.auth.mfa.listFactors();
  for (const factor of existing?.all ?? []) {
    if (factor.status !== "verified") await db.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data, error } = await db.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { error: "Could not start two-step verification" };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirms a factor (enrollment or sign-in) with a 6-digit code. */
export async function verifyTwoFactor(factorId: string, code: string): Promise<Result> {
  const db = supabase();
  if (!db) return { ok: false, reason: "Unavailable right now" };
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) return { ok: false, reason: "That code is not valid" };
  return { ok: true };
}

export async function disableTwoFactor(factorId: string): Promise<Result> {
  const db = supabase();
  if (!db) return { ok: false, reason: "Unavailable right now" };
  const { error } = await db.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false, reason: "Could not turn it off. Sign in again and retry." };
  return { ok: true };
}
