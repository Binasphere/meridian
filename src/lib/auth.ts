"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { hasSubtleCrypto, pbkdf2Sha256 } from "./pbkdf2";
import { supabase } from "./supabase/client";
import { identityEmail, normalisePhone, validateRegistration } from "./phone";

/**
 * Authentication.
 *
 * Two implementations behind one store, chosen by whether Supabase is
 * configured:
 *
 *   - **Supabase** (the real one). The Kenyan mobile number is carried as the
 *     auth identity via `identityEmail`, so the customer still signs in with a
 *     number and a password and never sees an email or a one-time code.
 *     Passwords are handled by Supabase; this file never sees a hash.
 *   - **Local simulation** (the fallback). Accounts in this browser's
 *     localStorage, so the app still runs — and can still be demoed — with no
 *     credentials at all. Kept because that property is what let the interface
 *     be built before the backend existed, and it costs one branch per action.
 *
 * The public surface is identical either way: `currentPhone`, `register`,
 * `signIn`, `signOut`, `useCurrentAccount`, `useAuthHydrated`. Nothing that
 * renders an account needs to know which path is live.
 */

// Re-exported so the many components that already import these from here keep
// working; the definitions live in `phone.ts`, which has no client directive and
// can therefore be shared with server routes.
export {
  normalisePhone,
  formatPhone,
  maskPhone,
  identityEmail,
  MIN_PASSWORD_LENGTH,
  MIN_USERNAME_LENGTH,
  MAX_USERNAME_LENGTH,
} from "./phone";

// ---------------------------------------------------------------------------
// Local-simulation password derivation
// ---------------------------------------------------------------------------

/**
 * Only the fallback path uses any of this. On the Supabase path the password
 * leaves the form and goes straight to Supabase; nothing here touches it.
 *
 * Two things are nonetheless done properly, because doing them wrong would
 * teach the wrong shape:
 *
 *   - Passwords are never stored in a form that can be read back. Each account
 *     keeps a random 16-byte salt and a PBKDF2-SHA256 derivation at 210,000
 *     iterations (the OWASP 2023 floor). Verifying is re-deriving and comparing.
 *   - The comparison is constant-time, so it cannot be turned into an oracle
 *     that leaks the hash a byte at a time.
 */

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

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
 * Uses WebCrypto where it exists and a pure-JS PBKDF2 where it does not.
 * `crypto.subtle` is only defined in a secure context, so opening the dev server
 * on its LAN address to test on a phone leaves it `undefined` — which is exactly
 * when you need sign-in to work. Both paths produce identical bytes.
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
 * `crypto.getRandomValues` is available in insecure contexts (only `subtle` is
 * gated), so there is no weak fallback here and there must never be one — a
 * predictable salt would be a real defect rather than a demo shortcut.
 */
function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
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
// Types
// ---------------------------------------------------------------------------

/** What the interface needs to know about the signed-in person. */
export interface StoredAccount {
  phone: string;
  /**
   * Chosen display name. Optional because accounts created before usernames
   * existed persist without one; the UI falls back to the phone.
   */
  username?: string;
  createdAt: number;
}

/** A local-simulation account: the profile plus its password verifier. */
interface LocalCredential extends StoredAccount {
  salt: string;
  hash: string;
}

export type AuthResult = { ok: true } | { ok: false; reason: string };

interface AuthState {
  /** Local-simulation vault. Untouched when Supabase is configured. */
  accounts: Record<string, LocalCredential>;
  /** The signed-in number, or null. Every gate in the app reads this. */
  currentPhone: string | null;
  /** The signed-in account. */
  profile: StoredAccount | null;
  /** False until the session has been established (or ruled out). */
  hydrated: boolean;

  register: (
    phone: string,
    username: string,
    password: string,
  ) => Promise<AuthResult>;
  signIn: (phone: string, password: string) => Promise<AuthResult>;
  signOut: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      accounts: {},
      currentPhone: null,
      profile: null,
      hydrated: false,

      // --- Register --------------------------------------------------------
      register: async (phoneInput, usernameInput, password) => {
        const validated = validateRegistration(phoneInput, usernameInput, password);
        if (!validated.ok) return { ok: false, reason: validated.reason };
        const { phone, username } = validated.value;

        const db = supabase();

        // --- Local simulation ---
        if (!db) {
          if (get().accounts[phone]) {
            return { ok: false, reason: "An account already exists for this number" };
          }

          const salt = randomBytes(SALT_BYTES);
          const hash = await derive(password, salt);
          const account: LocalCredential = {
            phone,
            username,
            createdAt: Date.now(),
            salt: toBase64(salt),
            hash,
          };

          set((state) => ({
            accounts: { ...state.accounts, [phone]: account },
            currentPhone: phone,
            profile: { phone, username, createdAt: account.createdAt },
          }));
          return { ok: true };
        }

        // --- Supabase ---
        // Creation goes through our own route so the user can be made
        // pre-confirmed; see `api/auth/register`. The browser never calls
        // `signUp` directly.
        try {
          const response = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ phone, username, password }),
          });

          if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as {
              error?: string;
            };
            return { ok: false, reason: body.error ?? "Could not create the account" };
          }
        } catch {
          return { ok: false, reason: "Could not reach the server" };
        }

        // Sign straight in, so creating an account lands the customer in the
        // terminal rather than back at a login form.
        return get().signIn(phone, password);
      },

      // --- Sign in ---------------------------------------------------------
      signIn: async (phoneInput, password) => {
        const phone = normalisePhone(phoneInput);
        if (!phone) {
          return { ok: false, reason: "Enter a valid Kenyan mobile number" };
        }

        const db = supabase();

        // --- Local simulation ---
        if (!db) {
          const account = get().accounts[phone];

          // Derive even when the account does not exist, against a throwaway
          // salt, so "no such number" and "wrong password" take the same time.
          // Otherwise login latency is an account-enumeration oracle.
          const salt = account ? fromBase64(account.salt) : randomBytes(SALT_BYTES);
          const candidate = await derive(password, salt);

          if (!account || !timingSafeEqual(candidate, account.hash)) {
            // One message for both cases, for the same reason.
            return { ok: false, reason: "Incorrect number or password" };
          }

          set({
            currentPhone: phone,
            profile: {
              phone: account.phone,
              username: account.username,
              createdAt: account.createdAt,
            },
          });
          return { ok: true };
        }

        // --- Supabase ---
        const { data, error } = await db.auth.signInWithPassword({
          email: identityEmail(phone),
          password,
        });

        if (error || !data.user) {
          // Deliberately one message, whatever went wrong: distinguishing
          // "no such number" from "wrong password" hands out a list of which
          // numbers hold accounts.
          return { ok: false, reason: "Incorrect number or password" };
        }

        set({ currentPhone: phone, profile: await readProfile(phone) });
        return { ok: true };
      },

      // --- Sign out --------------------------------------------------------
      signOut: () => {
        // Clear locally first so the UI never sits on a stale session waiting
        // for a network call it does not need to wait for.
        set({ currentPhone: null, profile: null });
        void supabase()?.auth.signOut();
      },
    }),
    {
      name: "meridian.auth.v1",
      storage: createJSONStorage(() => localStorage),
      // The Supabase session is persisted by supabase-js, not here, and
      // `hydrated` describes this run rather than the last one. Persisting the
      // vault and the last-known session keeps the local fallback working; on
      // the Supabase path `bootstrap` overwrites both before anything renders.
      partialize: (state) => ({
        accounts: state.accounts,
        currentPhone: state.currentPhone,
        profile: state.profile,
      }),
    },
  ),
);

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * Reads the signed-in user's own profile row.
 *
 * RLS restricts this to `auth.uid() = id`, so a customer can only ever read
 * themselves — the query does not even need a `where` clause to be safe, and
 * it is written without one so that fact stays visible.
 *
 * Falls back to auth metadata if the row is missing, which can only happen if
 * the `on_auth_user_created` trigger was not installed. Signing in with a
 * half-provisioned account is better than a blank screen.
 */
async function readProfile(phone: string): Promise<StoredAccount> {
  const db = supabase();
  if (!db) return { phone, createdAt: Date.now() };

  const { data } = await db
    .from("profiles")
    .select("phone, username, created_at")
    .maybeSingle();

  if (data) {
    return {
      phone: data.phone ?? phone,
      username: data.username ?? undefined,
      createdAt: new Date(data.created_at).getTime(),
    };
  }

  const { data: auth } = await db.auth.getUser();
  const meta = auth.user?.user_metadata as
    | { phone?: string; username?: string }
    | undefined;

  return {
    phone: meta?.phone ?? phone,
    username: meta?.username,
    createdAt: auth.user?.created_at
      ? new Date(auth.user.created_at).getTime()
      : Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/**
 * Establishes the session once per page load.
 *
 * On the Supabase path the persisted `currentPhone` is not evidence of anything
 * — the token behind it may have expired hours ago — so it is replaced by
 * whatever `getSession()` actually returns, including replacing it with null.
 * `hydrated` only goes true afterwards, so nothing renders on a guess.
 */
let bootstrapped = false;

function bootstrap(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  const db = supabase();

  if (!db) {
    // Local simulation: the persisted state *is* the session.
    useAuth.setState({ hydrated: true });
    return;
  }

  void (async () => {
    const { data } = await db.auth.getSession();
    const email = data.session?.user.email ?? null;
    // The identity email is the normalised number with the domain appended.
    const phone = email ? (email.split("@")[0] ?? null) : null;

    useAuth.setState({
      currentPhone: phone,
      profile: phone ? await readProfile(phone) : null,
      hydrated: true,
    });
  })();

  // A token refresh failure or a sign-out in another tab has to land here too,
  // otherwise one tab keeps rendering a terminal for a session that is gone.
  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) {
      useAuth.setState({ currentPhone: null, profile: null });
    }
  });
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Whether the session has been established yet.
 *
 * Deliberately *not* driven by `onRehydrateStorage`. That is the obvious way to
 * write it and it is broken: localStorage is synchronous, so Zustand runs the
 * whole hydration chain during the `create()` call, and a callback referencing
 * `useAuth` hits the temporal dead zone. Zustand swallows the throw, the flag is
 * never set, and any component gating on it renders its fallback forever — a
 * permanently blank screen with nothing in the console.
 *
 * Running from an effect means the store is fully constructed by the time we
 * touch it, and gives the async Supabase session somewhere to land.
 */
export function useAuthHydrated(): boolean {
  const hydrated = useAuth((state) => state.hydrated);

  useEffect(() => {
    bootstrap();
  }, []);

  // Persisted state must also have been read, or the local fallback would show
  // a signed-out app for a frame.
  const [storageRead, setStorageRead] = useState(false);
  useEffect(() => {
    if (useAuth.persist.hasHydrated()) setStorageRead(true);
    return useAuth.persist.onFinishHydration(() => setStorageRead(true));
  }, []);

  return hydrated && storageRead;
}

/** The signed-in account, or null. */
export function useCurrentAccount(): StoredAccount | null {
  return useAuth((state) => state.profile);
}
