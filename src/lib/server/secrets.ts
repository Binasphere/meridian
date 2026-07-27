import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Server secrets. **Server only.**
 *
 * One lookup for every value that must never reach the browser: the Supabase
 * service-role key, the admin passcode, the PayHero credentials. Two sources,
 * in order:
 *
 *   1. The environment variable of the same name — set in a host's dashboard
 *      (Vercel, Railway) or a `.env.local` in development. Always wins.
 *   2. `secrets.local.json` at the repository root — a plain
 *      `{ "NAME": "value" }` file for hosts where you deploy the folder itself
 *      (a VPS, Docker) and would rather not configure an environment at all.
 *
 * The file is gitignored, and that is load-bearing: this repository is public,
 * so a secret committed to it is published to the world within minutes. The
 * *public* Supabase URL and anon key live in `supabase/config.ts` as literals
 * precisely because they are not secrets; everything that goes through here is.
 */

const SECRETS_FILE = "secrets.local.json";

// `undefined` = not read yet; `null` = read and absent/unparseable.
let fileSecrets: Record<string, unknown> | null | undefined;

function fromFile(name: string): string {
  if (fileSecrets === undefined) {
    try {
      fileSecrets = JSON.parse(
        readFileSync(join(process.cwd(), SECRETS_FILE), "utf8"),
      ) as Record<string, unknown>;
    } catch {
      fileSecrets = null;
    }
  }

  const value = fileSecrets?.[name];
  return typeof value === "string" ? value : "";
}

/** The named secret, or `""` when configured nowhere. */
export function serverSecret(name: string): string {
  if (typeof window !== "undefined") {
    throw new Error(
      "serverSecret() was imported into client code — secrets must never reach the browser.",
    );
  }
  return process.env[name] || fromFile(name);
}
