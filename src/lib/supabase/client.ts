"use client";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Browser Supabase client.
 *
 * Venti's auth, balances and trades currently run as a client-side
 * simulation (see `auth.ts` / `store.ts`). Supabase is the seam they migrate
 * onto: this module gives the rest of the app one place to reach the backend,
 * so wiring a feature to real persistence is an import rather than a rewrite.
 *
 * Configuration comes from `config.ts`, which falls back to baked-in literals
 * so a deployment needs no environment at all. If those are ever blank,
 * `supabase()` returns `null` and callers degrade to the local simulation
 * rather than crashing at boot.
 *
 * Only the anon (publishable) key belongs here — it is safe to ship to the
 * browser precisely because row-level security, not the key, is what guards the
 * data. The service-role key must never appear in client code.
 */

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

const url = SUPABASE_URL;
const anonKey = SUPABASE_ANON_KEY;

/** True when both public Supabase values are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

// Memoised so React Fast Refresh and repeated calls do not each open a new
// realtime connection.
const globalForSupabase = globalThis as unknown as {
  __ventiSupabase?: SupabaseClient | null;
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
  if (globalForSupabase.__ventiSupabase !== undefined) {
    return globalForSupabase.__ventiSupabase;
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

  globalForSupabase.__ventiSupabase = client;
  return client;
}
