import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { identityEmail, validateRegistration } from "@/lib/phone";

/**
 * POST /api/auth/register — create an account.
 *
 * Sign-in happens in the browser against Supabase directly; only *creation*
 * comes through here, for one reason: this project has email confirmation
 * switched on, and the identity address derived from a phone number is on a
 * reserved domain that can never receive mail. A browser `signUp` would create
 * an unconfirmed user, mail a link into the void, and leave the customer unable
 * to sign in — a dead end with no way out from inside the app.
 *
 * The service role can create the user already confirmed, so the flow works
 * without asking anyone to change a dashboard setting, and without weakening
 * confirmation for any real email address you may want to use later.
 *
 * Creating a user is the only thing this route can do. It takes no role, no
 * tier and no balance from the request — a registration endpoint that accepts a
 * `live_tier` is a self-service VIP button.
 */

export const runtime = "nodejs";

/**
 * Sign-up attempts per window, per address. Account creation is the one
 * unauthenticated write in the app, so it is the one worth rate-limiting: this
 * stops a script from filling `auth.users` faster than anyone would notice.
 * In-memory and therefore per-instance — enough for a single deployment, and
 * the place to reach for Postgres or the edge if that stops being true.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function throttled(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(request: NextRequest) {
  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json(
      { error: "Sign-up is unavailable — Supabase is not configured." },
      { status: 503 },
    );
  }

  const client =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (throttled(client)) {
    return NextResponse.json(
      { error: "Too many sign-up attempts. Try again later." },
      { status: 429 },
    );
  }

  let body: { phone?: unknown; username?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  // Re-run the same rules the form ran. The client's copy is there to give
  // instant feedback; this one is the one that decides.
  const validated = validateRegistration(
    typeof body.phone === "string" ? body.phone : "",
    typeof body.username === "string" ? body.username : "",
    typeof body.password === "string" ? body.password : "",
  );
  if (!validated.ok) {
    return NextResponse.json({ error: validated.reason }, { status: 400 });
  }

  const { phone, username, password } = validated.value;

  const { error } = await db.auth.admin.createUser({
    email: identityEmail(phone),
    password,
    // Pre-confirmed: nothing can be sent to the derived address, so waiting on
    // a confirmation that will never arrive would strand the account.
    email_confirm: true,
    // `handle_new_user` reads these to populate `public.profiles`.
    user_metadata: { phone, username },
  });

  if (error) {
    // Supabase reports a duplicate as 422 "already been registered". Say what
    // it means in the app's own terms; anything else is passed through as a
    // server fault rather than as the customer's mistake.
    const duplicate =
      error.status === 422 || /already/i.test(error.message ?? "");

    return NextResponse.json(
      {
        error: duplicate
          ? "An account already exists for this number"
          : (error.message ?? "Could not create the account"),
      },
      { status: duplicate ? 409 : 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
