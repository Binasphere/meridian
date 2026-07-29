/**
 * Where the backend service lives.
 *
 * The split-out service (its own private repo, hosted on Render) holds every
 * endpoint that needs a server-side secret and a public HTTPS address: deposit
 * initiation, the PayHero callback, and account registration. The frontend can
 * therefore be served from a host with no environment at all.
 *
 * Like the Supabase URL in `supabase/config.ts`, this origin is public by
 * design — every browser request carries it — so a baked-in literal is fine.
 * An empty value means "this deployment's own /api routes", which remain in
 * place and make local development work against a fully-configured
 * `.env.local` with no service running.
 */
const FALLBACK_BACKEND_ORIGIN = "https://trad-z5gt.onrender.com";

export const BACKEND_ORIGIN = (
  process.env.NEXT_PUBLIC_BACKEND_URL || FALLBACK_BACKEND_ORIGIN
).replace(/\/+$/, "");

/**
 * Where the VIP demo M-Pesa rail lives, from the browser's side.
 *
 * The rail's routes exist in **both** places, over one Supabase wallet:
 *
 *   - in this app under `/api/mpesa/*`, which works in development because
 *     `.env.local` carries the service-role key;
 *   - in the payments service, which is where the key lives in production.
 *
 * So development talks to itself — no cold start between pressing Pay now and
 * the phone updating — and a deployed build talks to the service, because a
 * public frontend deliberately holds no secrets. Either way the balance is the
 * same row, so the handset stays in step with whichever terminal is driving.
 */
export const MPESA_RAIL_ORIGIN =
  process.env.NODE_ENV === "development" ? "" : BACKEND_ORIGIN;
