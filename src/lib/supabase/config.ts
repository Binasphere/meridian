/**
 * The public Supabase configuration.
 *
 * These two values are **not secrets**, and treating them as if they were is a
 * common and costly confusion. Every request the browser makes to Supabase
 * carries both in plain sight: the URL in the address, the anon key in the
 * `apikey` header. Open devtools on any Supabase app in the world and they are
 * right there. They are published by design.
 *
 * What protects the data is **row-level security**, not the secrecy of the key.
 * The anon key says "I am an anonymous visitor"; the policies on each table
 * decide what an anonymous visitor may see. That is why hardcoding these is
 * safe, and why obfuscating them would buy exactly nothing — you cannot hide a
 * value you hand to every visitor by definition.
 *
 * Baked in as literals so a deployment works with no environment configured at
 * all. An env var still wins where one is set, so a second project (staging, a
 * fork, someone else's Supabase) needs no code change.
 */

/** The project this build points at when nothing overrides it. */
const FALLBACK_URL = "https://ihjfuowbjsqdxhfnlzdr.supabase.co";

/**
 * The anon / publishable key. Role `anon`, bounded entirely by RLS.
 *
 * If this ever needs to be "protected", the answer is never to hide it — it is
 * to fix the policy that let it do something it should not.
 */
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloamZ1b3dianNxZHhoZm5semRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU3NjgwNzQsImV4cCI6MjExMTM0NDA3NH0.tOmzYjWxHUALWUKHCZnPHEmx7_rl_c6EB44o_JtUVu8";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY;

/** The project ref, for display — derived rather than repeated. */
export function supabaseProjectRef(): string | null {
  try {
    return new URL(SUPABASE_URL).hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}
