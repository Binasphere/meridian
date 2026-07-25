import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  SESSION_MAX_AGE_SEC,
  isAdminEnabled,
  issueToken,
  verifyPasscode,
  verifyToken,
} from "@/lib/admin/session";

/**
 * Admin sign-in / sign-out.
 *
 * POST { passcode } → sets the signed session cookie.
 * DELETE            → clears it.
 * GET               → whether the caller currently holds a valid session.
 */

// Node runtime: the session module uses node:crypto.
export const runtime = "nodejs";

/**
 * Attempt throttle.
 *
 * A shared passcode with unlimited attempts is a passcode with a few hours of
 * life. This is in-memory and therefore per-instance — enough to make a script
 * useless against a single-instance deployment, and honestly not more than
 * that. A real deployment behind several instances wants this in Postgres or
 * at the edge.
 */
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function throttled(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

function clientKey(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"
  );
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    enabled: isAdminEnabled(),
    signedIn: verifyToken(request.cookies.get(ADMIN_COOKIE)?.value),
  });
}

export async function POST(request: NextRequest) {
  if (!isAdminEnabled()) {
    return NextResponse.json(
      { error: "Admin panel is disabled. Set ADMIN_PASSCODE in .env.local." },
      { status: 503 },
    );
  }

  if (throttled(clientKey(request))) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  let passcode = "";
  try {
    const body = (await request.json()) as { passcode?: unknown };
    if (typeof body.passcode === "string") passcode = body.passcode;
  } catch {
    // Malformed body falls through to the same rejection as a wrong passcode.
  }

  if (!verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, issueToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
