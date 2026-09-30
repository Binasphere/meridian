"use client";

import { supabase } from "./supabase/client";

export type VerificationStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

export interface Verification {
  status: VerificationStatus;
  note: string | null;
}

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

/** The signed-in customer's submission, if any. RLS limits the read to them. */
export async function myVerification(): Promise<Verification> {
  const db = supabase();
  if (!db) return { status: "NONE", note: null };
  const { data } = await db.from("verifications").select("status, note").maybeSingle();
  if (!data) return { status: "NONE", note: null };
  return { status: data.status as VerificationStatus, note: data.note };
}

/**
 * Uploads both documents into the customer's own private folder, then records
 * them together. Neither is accepted alone.
 */
export async function submitVerification(
  idFile: File,
  addressFile: File,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = supabase();
  if (!db) return { ok: false, reason: "Verification is unavailable right now" };

  const { data: auth } = await db.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { ok: false, reason: "Sign in again to continue" };

  for (const file of [idFile, addressFile]) {
    if (file.size > MAX_DOCUMENT_BYTES) {
      return { ok: false, reason: `${file.name} is over 10 MB` };
    }
  }

  const stamp = Date.now();
  const extension = (file: File) =>
    (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const idPath = `${uid}/national-id-${stamp}.${extension(idFile)}`;
  const addressPath = `${uid}/proof-of-address-${stamp}.${extension(addressFile)}`;

  const bucket = db.storage.from("verification");
  for (const [path, file] of [
    [idPath, idFile],
    [addressPath, addressFile],
  ] as const) {
    const { error } = await bucket.upload(path, file, { contentType: file.type });
    if (error) return { ok: false, reason: "Upload failed. Try again." };
  }

  const { error } = await db.rpc("submit_verification", {
    p_id_path: idPath,
    p_address_path: addressPath,
  });
  if (error) return { ok: false, reason: "Could not submit. Try again." };
  return { ok: true };
}
