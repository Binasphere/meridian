import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, isAdminEnabled, verifyToken } from "./session";
import { isAdminDbConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one gate every privileged route passes through.
 *
 * Returns either a ready-made error response or the service-role client. Having
 * a single function that answers "may this request touch other people's data,
 * and with what" is what keeps the check from being forgotten on the third
 * route someone adds — a forgotten guard here is a full database leak, not a
 * bug.
 */
export function guard(
  request: NextRequest,
): { error: NextResponse } | { db: SupabaseClient } {
  if (!isAdminEnabled()) {
    return {
      error: NextResponse.json(
        { error: "Admin panel is disabled. Set ADMIN_PASSCODE." },
        { status: 503 },
      ),
    };
  }

  if (!verifyToken(request.cookies.get(ADMIN_COOKIE)?.value)) {
    return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }

  if (!isAdminDbConfigured()) {
    return {
      error: NextResponse.json(
        { error: "Supabase is not configured. Set SUPABASE_SERVICE_ROLE_KEY." },
        { status: 503 },
      ),
    };
  }

  const db = supabaseAdmin();
  if (!db) {
    return {
      error: NextResponse.json({ error: "Supabase is not configured" }, { status: 503 }),
    };
  }

  return { db };
}
