"use client";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Browser Supabase client.
 *
 * Meridian's auth, balances and trades currently run as a client-side
 * simulation (see `auth.ts` / `store.ts`). Supabase is the seam they migrate
 * onto: this module gives the rest of the app one place to reach the backend,
 * so wiring a feature to real persistence is an import rather than a rewrite.
 *
 * Configuration is **optional and lazy**. Until the environment variables are
 * set the app runs exactly as before — `supabase()` returns `null` and callers
 * fall back to the local simulation. That keeps the demo working with no
 * credentials while the real backend is stood up, and means a missing key is a
 * graceful degradation rather than a boot crash.
 *
 * Only the anon (publishable) key belongs here — it is safe to ship to the
 * browser precisely because row-level security, not the key, is what guards the
 * data. The service-role key must never appear in client code.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when both public Supabase variables are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

// Memoised so React Fast Refresh and repeated calls do not each open a new
// realtime connection.
const globalForSupabase = globalThis as unknown as {
  __meridianSupabase?: SupabaseClient | null;
};

/**
 * The shared client, or `null` when Supabase is not configured.
 *
 * Callers must handle `null` and degrade to the local simulation:
 *
 *   const db = supabase();
 *   if (!db) return; // running on the client-side simulation
 */
export function supabase(): SupabaseClient | null {
  if (globalForSupabase.__meridianSupabase !== undefined) {
    return globalForSupabase.__meridianSupabase;
  }

  const client =
    url && anonKey
      ? createClient(url, anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
          },
        })
      : null;

  globalForSupabase.__meridianSupabase = client;
  return client;
}
