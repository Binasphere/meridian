import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { prisma } from "./db";

/**
 * Authentication.
 *
 * Sessions are JWTs in an httpOnly cookie, backed by a `Session` row. The row
 * is what makes them revocable: a stateless token alone cannot be invalidated
 * before it expires, which means "log out everywhere" and "ban this account"
 * would both be lies. Every request verifies the signature *and* confirms the
 * row still exists.
 */

const COOKIE_NAME = "meridian_session";
const SESSION_TTL_DAYS = 30;

/** bcrypt cost. 12 is ~250ms on commodity hardware — deliberately slow. */
const BCRYPT_ROUNDS = 12;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarSeed: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short (need >= 32 chars). Copy .env.example to .env.",
    );
  }
  return new TextEncoder().encode(secret);
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * A constant-time-ish dummy verification.
 *
 * Called when a login names an address that does not exist, so that "no such
 * user" and "wrong password" take the same wall-clock time. Without it, login
 * latency is an account-enumeration oracle.
 */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEe.ZFQqLKrXRjS0LrMJXAX9k6HGVJZ0FBu";
export async function burnPasswordTime(): Promise<void> {
  await bcrypt.compare("meridian-dummy-password", DUMMY_HASH);
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 255),
      ip: meta.ip?.slice(0, 64),
    },
  });

  const token = await new SignJWT({ sub: userId, sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("meridian")
    .setAudience("meridian-web")
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return session.id;
}

/** Verifies a raw token string. Shared by HTTP routes and the WebSocket handshake. */
export async function resolveToken(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "meridian",
      audience: "meridian-web",
    });

    const sessionId = payload.sid;
    if (typeof sessionId !== "string") return null;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            avatarSeed: true,
            isActive: true,
          },
        },
      },
    });

    // Revocation, expiry, and deactivation all funnel through here.
    if (!session || session.expiresAt < new Date()) return null;
    if (!session.user.isActive) return null;

    const { isActive: _isActive, ...user } = session.user;
    return user;
  } catch {
    // Bad signature, malformed token, expired claim — all equally "not signed in".
    return null;
  }
}

/** The signed-in user for the current request, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return resolveToken(store.get(COOKIE_NAME)?.value);
}

/** Like `currentUser`, but throws — for routes that have no anonymous branch. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ForbiddenError();
  return user;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, secretKey(), {
        issuer: "meridian",
        audience: "meridian-web",
      });
      if (typeof payload.sid === "string") {
        await prisma.session.deleteMany({ where: { id: payload.sid } });
      }
    } catch {
      // Already invalid; clearing the cookie below is all that is left to do.
    }
  }

  store.delete(COOKIE_NAME);
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Not permitted");
    this.name = "ForbiddenError";
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
