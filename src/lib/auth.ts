"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { hasSubtleCrypto, pbkdf2Sha256 } from "./pbkdf2";

/**
 * Simulated authentication.
 *
 * ⚠️ This is a **client-side simulation**. Accounts live in this browser's
 * localStorage and nothing is verified against a server. It exists so the sign-
 * in flow, the session model and the account panel can be designed and demoed;
 * it is not, and must not be mistaken for, a security boundary. Anyone with
 * devtools can read and edit this store.
 *
 * Two things are nonetheless done properly, because doing them wrong here would
 * teach the wrong shape to the real implementation:
 *
 *   - Passwords are **never stored**, in any form that can be read back. Each
 *     account keeps a random 16-byte salt and a PBKDF2-SHA256 derivation at
 *     210,000 iterations (the OWASP 2023 floor for PBKDF2-SHA256). Verifying is
 *     re-deriving and comparing.
 *   - The comparison is **constant-time**, so it cannot be turned into an oracle
 *     that leaks the hash a byte at a time.
 *
 * When this moves server-side, the derivation moves with it and the client stops
 * seeing passwords at all beyond the moment of submission. Argon2id is the
 * better choice there; PBKDF2 is used here only because it is what the browser's
 * SubtleCrypto exposes natively.
 */

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

// ---------------------------------------------------------------------------
// Phone numbers
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

/** A short, non-identifying label: `••• 5678`. */
export function maskPhone(normalised: string): string {
  return `••• ${normalised.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Password derivation
// ---------------------------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Derives the stored verifier.
 *
 * Uses WebCrypto where it exists and a pure-JS PBKDF2 where it does not.
 * `crypto.subtle` is only defined in a secure context, so opening the dev server
 * on its LAN address to test on a phone leaves it `undefined` — which is exactly
 * when you need sign-in to work.
 *
 * Both paths take identical parameters and produce identical bytes, so an
 * account created on localhost unlocks over the LAN and vice versa. That
 * equality is asserted by the test harness, not assumed.
 */
async function derive(password: string, salt: Uint8Array): Promise<string> {
  const passwordBytes = new TextEncoder().encode(password);

  if (hasSubtleCrypto()) {
    const material = await crypto.subtle.importKey(
      "raw",
      passwordBytes as unknown as BufferSource,
      "PBKDF2",
      false,
      ["deriveBits"],
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt.slice() as unknown as BufferSource,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      material,
      KEY_BITS,
    );

    return toBase64(new Uint8Array(bits));
  }

  return toBase64(pbkdf2Sha256(passwordBytes, salt, PBKDF2_ITERATIONS));
}

/**
 * Random bytes.
 *
 * `crypto.getRandomValues` is available in insecure contexts (only `subtle` is
 * gated), so there is no weak fallback here and there must never be one — a
 * predictable salt would be a real defect rather than a demo shortcut.
 */
function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Constant-time string comparison.
 *
 * `a === b` on secrets short-circuits at the first differing byte, which makes
 * verification time a function of how much of the hash you guessed correctly.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface StoredAccount {
  phone: string;
  salt: string;
  hash: string;
  createdAt: number;
}

export type AuthResult = { ok: true } | { ok: false; reason: string };

interface AuthState {
  accounts: Record<string, StoredAccount>;
  currentPhone: string | null;

  register: (phone: string, password: string) => Promise<AuthResult>;
  signIn: (phone: string, password: string) => Promise<AuthResult>;
  signOut: () => void;
}

export const MIN_PASSWORD_LENGTH = 8;

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      accounts: {},
      currentPhone: null,

      register: async (phoneInput, password) => {
        const phone = normalisePhone(phoneInput);
        if (!phone) {
          return { ok: false, reason: "Enter a valid Kenyan mobile number" };
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
          return {
            ok: false,
            reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
          };
        }
        if (get().accounts[phone]) {
          return {
            ok: false,
            reason: "An account already exists for this number",
          };
        }

        const salt = randomBytes(SALT_BYTES);
        const hash = await derive(password, salt);

        set((state) => ({
          accounts: {
            ...state.accounts,
            [phone]: {
              phone,
              salt: toBase64(salt),
              hash,
              createdAt: Date.now(),
            },
          },
          currentPhone: phone,
        }));

        return { ok: true };
      },

      signIn: async (phoneInput, password) => {
        const phone = normalisePhone(phoneInput);
        if (!phone) {
          return { ok: false, reason: "Enter a valid Kenyan mobile number" };
        }

        const account = get().accounts[phone];

        // Derive even when the account does not exist, against a throwaway
        // salt, so "no such number" and "wrong password" take the same time.
        // Otherwise login latency is an account-enumeration oracle.
        const salt = account
          ? fromBase64(account.salt)
          : randomBytes(SALT_BYTES);
        const candidate = await derive(password, salt);

        if (!account || !timingSafeEqual(candidate, account.hash)) {
          // One message for both cases, for the same reason.
          return { ok: false, reason: "Incorrect number or password" };
        }

        set({ currentPhone: phone });
        return { ok: true };
      },

      signOut: () => set({ currentPhone: null }),
    }),
    {
      name: "meridian.auth.v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/**
 * Whether persisted state has been read yet.
 *
 * Deliberately *not* a field on the store set from `onRehydrateStorage`. That is
 * the obvious way to write it and it is broken: localStorage is synchronous, so
 * Zustand runs the whole hydration chain during the `create()` call, and a
 * callback that references `useAuth` hits the temporal dead zone. Zustand
 * catches the throw, `hasHydrated` is never set, and any component gating on the
 * flag renders its fallback forever — which presents as a permanently blank
 * screen with no error in the console.
 *
 * `persist.hasHydrated()` plus `onFinishHydration` is the supported API, and
 * reading it from an effect means the store is fully constructed by the time we
 * touch it.
 */
export function useAuthHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useAuth.persist.hasHydrated()) setHydrated(true);
    return useAuth.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}

/** The signed-in account, or null. */
export function useCurrentAccount(): StoredAccount | null {
  return useAuth((state) =>
    state.currentPhone ? (state.accounts[state.currentPhone] ?? null) : null,
  );
}
