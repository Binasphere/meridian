"use client";

import { useAuth } from "./auth";
import { supabase } from "./supabase/client";

export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Uploads a profile photo into the customer's own folder and points the
 * profile at it. A new file name each time, so a cached old photo can never
 * be shown in place of the new one.
 */
export async function uploadAvatar(file: File): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = supabase();
  if (!db) return { ok: false, reason: "Unavailable right now" };
  if (file.size > MAX_BYTES) return { ok: false, reason: "Use an image under 2 MB" };
  if (!AVATAR_ACCEPT.split(",").includes(file.type)) {
    return { ok: false, reason: "Use a JPG, PNG or WebP image" };
  }

  const { data: auth } = await db.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { ok: false, reason: "Sign in again to continue" };

  const extension = file.type.split("/")[1] ?? "jpg";
  const path = `${uid}/avatar-${Date.now()}.${extension}`;
  const { error: uploadError } = await db.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) return { ok: false, reason: "Upload failed. Try again." };

  const url = db.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const { error } = await db.rpc("set_avatar", { p_url: url });
  if (error) return { ok: false, reason: "Could not save the photo" };

  const profile = useAuth.getState().profile;
  if (profile) useAuth.setState({ profile: { ...profile, avatarUrl: url } });
  return { ok: true };
}
