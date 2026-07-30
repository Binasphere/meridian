/**
 * Phone identity and account validation.
 *
 * Deliberately free of `"use client"` and of any React or store import, so the
 * same rules can run in the browser *and* inside a server route handler. Sign-up
 * validation that exists only on the client is decoration — anyone can POST past
 * it — so these functions are the shared definition and the server is the one
 * whose verdict counts.
 */

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/**
 * Normalises a Kenyan mobile number to `2547XXXXXXXX` / `2541XXXXXXXX`.
 *
 * Accepts every shape a person actually types: `0712345678`, `712345678`,
 * `+254 712 345 678`, `254712345678`, with or without spaces and dashes.
 * Returns null if it is not a valid Safaricom/Airtel-range mobile number.
 */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");

  let national: string;
  if (digits.startsWith("254")) national = digits.slice(3);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else national = digits;

  // Kenyan mobile numbers are 9 digits nationally and begin 7 or 1.
  if (!/^[71]\d{8}$/.test(national)) return null;
  return `254${national}`;
}

/** `254712345678` -> `+254 712 345 678`. */
export function formatPhone(normalised: string): string {
  const national = normalised.slice(3);
  return `+254 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

/**
 * `254712345678` -> `+254 712 *** 678`.
 *
 * What the customer sees on their own screens. The prefix and the last three
 * digits are enough for the owner to recognise their number and to catch a
 * wrong one; the middle three are not, so a number read over someone's
 * shoulder — or left on a screen in an internet café — is not a number anyone
 * can use. `formatPhone` stays unmasked for the admin console, which has to
 * pay out against the real digits.
 */
export function formatPhoneMasked(normalised: string): string {
  const national = normalised.slice(3);
  return `+254 ${national.slice(0, 3)} *** ${national.slice(6)}`;
}

/** A short, non-identifying label: `••• 5678`. */
export function maskPhone(normalised: string): string {
  return `••• ${normalised.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// The Supabase Auth identity
// ---------------------------------------------------------------------------

/**
 * Supabase Auth identifies a user by an email address or a phone number.
 * Venti's identity is a Kenyan mobile number and a password — and native
 * phone auth means an SMS one-time code, which needs a paid SMS provider and
 * changes the product from "password" to "wait for a text".
 *
 * So the number is carried *as* the email identity: a stable, syntactically
 * valid address derived from the normalised number. Nothing is ever sent to it.
 * The real number lives in the auth user's metadata and in `profiles.phone`,
 * which is what every other part of the system reads.
 *
 * `.invalid` is the RFC 2606 reserved TLD for exactly this — a domain guaranteed
 * never to resolve, so a stray mail can never reach a real person's inbox.
 */
/**
 * Deliberately still `meridian.invalid` after the rename to Venti.
 *
 * This string is not branding — it is half of the primary key every existing
 * account signs in with. Supabase Auth stores `254…@meridian.invalid` as the
 * user's email; change the domain here and `signInWithPassword` looks up an
 * address that exists for nobody, locking every registered customer out of
 * their own money. Renaming it is a data migration over `auth.users`, not an
 * edit to this line, and it buys nothing visible — the address is never shown
 * and never delivered to.
 */
const IDENTITY_DOMAIN = "meridian.invalid";

export function identityEmail(normalisedPhone: string): string {
  return `${normalisedPhone}@${IDENTITY_DOMAIN}`;
}

// ---------------------------------------------------------------------------
// Account rules
// ---------------------------------------------------------------------------

export const MIN_PASSWORD_LENGTH = 8;
export const MIN_USERNAME_LENGTH = 2;
export const MAX_USERNAME_LENGTH = 24;

export interface Credentials {
  phone: string;
  username: string;
  password: string;
}

export type Validated =
  | { ok: true; value: Credentials }
  | { ok: false; reason: string };

/**
 * The one definition of "is this a valid sign-up".
 *
 * Returns the *normalised* values on success, so a caller can never accidentally
 * store the raw input it was handed.
 */
export function validateRegistration(
  phoneInput: string,
  usernameInput: string,
  password: string,
): Validated {
  const phone = normalisePhone(phoneInput);
  if (!phone) return { ok: false, reason: "Enter a valid Kenyan mobile number" };

  const username = usernameInput.trim();
  if (username.length < MIN_USERNAME_LENGTH) {
    return {
      ok: false,
      reason: `Username must be at least ${MIN_USERNAME_LENGTH} characters`,
    };
  }
  if (username.length > MAX_USERNAME_LENGTH) {
    return {
      ok: false,
      reason: `Username must be at most ${MAX_USERNAME_LENGTH} characters`,
    };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  }

  return { ok: true, value: { phone, username, password } };
}
