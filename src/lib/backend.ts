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
