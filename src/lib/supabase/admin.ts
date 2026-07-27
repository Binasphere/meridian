import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. **Server only.**
 *
 * The browser client in `client.ts` speaks as the signed-in user and is bounded
 * by row-level security: a user sees their own row and nothing else. That is
 * the correct posture for the app, and it is precisely what an admin panel has
 * to step outside of — listing every profile, and writing a tier onto someone
 * else's row, are the two things RLS is there to refuse.
 *
 * So the panel does not "log in as an admin" from the browser at all. Every
 * privileged read and write happens inside a route handler under this key,
 * which bypasses RLS entirely, and the browser only ever sees the JSON that
 * comes back. The key never reaches the client bundle, and the throw below
 * turns a mistaken client import into a loud failure rather than a silent
 * `undefined` that ships a secret.
 */

import { SUPABASE_URL } from "./config";
import { serverSecret } from "@/lib/server/secrets";

const url = SUPABASE_URL;

/**
 * The one value with no baked-in fallback, and it stays that way.
 *
 * The service role bypasses row-level security completely: it can read, edit
 * and delete every user's data. Committing it to source would publish it — and
 * this repository is public, where automated scanners find keys in minutes.
 * There is no way to write it into the bundle "safely": obfuscation cannot work
 * on a value the program must be able to decode, because the decoder ships
 * alongside it.
 *
 * Comes from the environment, or from the gitignored `secrets.local.json` for
 * hosts with no env configuration — see `lib/server/secrets.ts`.
 */
function serviceRoleKey(): string {
  return serverSecret("SUPABASE_SERVICE_ROLE_KEY");
}

/** True when the server has everything it needs to talk to Supabase. */
export function isAdminDbConfigured(): boolean {
  return Boolean(url && serviceRoleKey());
}

let cached: SupabaseClient | null = null;

/**
 * The shared service-role client.
 *
 * Returns `null` when unconfigured so callers answer with a clear 503 instead
 * of crashing the route.
 */
export function supabaseAdmin(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    throw new Error(
      "supabaseAdmin() was imported into client code — the service-role key must never reach the browser.",
    );
  }

  if (cached) return cached;
  const key = serviceRoleKey();
  if (!url || !key) return null;

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
