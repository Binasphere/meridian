#!/usr/bin/env node
/**
 * Fails if a product name has crept back into anything a customer can see.
 *
 * One build answers on every domain, so any hardcoded product name is correct
 * on exactly one of them and wrong on the rest. The customer-facing name comes
 * from the address bar (`useDomainLabel`) or, on the server, from the request
 * host (`callerDomain`). This script is the guard that keeps it that way — the
 * kind of rule that is obvious the week it is written and forgotten the week
 * after.
 *
 *     node scripts/check-branding.mjs        # report and exit non-zero on a hit
 *     npm run check:branding
 *
 * ---------------------------------------------------------------------------
 * Why this cannot be a plain grep
 * ---------------------------------------------------------------------------
 * The word also appears in places where it is an **identifier**, not a name,
 * and changing those breaks things in ways nobody notices until later:
 *
 *   - `venti.auth.v1`, `venti.session.v6`, `venti.admin.token`,
 *     `venti.host.token` are localStorage keys. Renaming them signs out every
 *     customer, every admin and every host, and abandons their local state.
 *   - `UNTAGGED_SITE = "venti"` is the site *id* that decides which accounts
 *     carry the untagged Supabase identity. Renaming it locks out every account
 *     created before the split — permanently.
 *   - `__ventiMarket`, `__ventiSupabase` are process globals. Invisible.
 *   - `ventitradingfx.com` and `barsfx.com` are real domains, in the sites list
 *     where they belong.
 *
 * So the check is: flag the word in **user-visible strings and JSX text**,
 * ignore it inside identifiers, comments, and the allowlisted lines below.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SRC = join(ROOT, "src");

/**
 * Product names that must not be hardcoded anywhere a customer can read.
 *
 * `Bars FX` and `BarsFX` are listed rather than a bare `Bars`, deliberately.
 * The word on its own is ordinary vocabulary in a trading app — chart bars, a
 * bar series, `BarRows` — so listing it would flag legitimate text and turn
 * this check into noise somebody learns to skip. The two spellings that are
 * actually the *brand* are the two worth catching.
 */
const BRANDS = ["Venti", "Candix", "Meridian", "Bars FX", "BarsFX"];

/**
 * Exact `path:line` pairs that are allowed to contain the word, each with the
 * reason. A new entry here should be rare and should say why.
 */
const ALLOWED = new Map([
  ["src/lib/sites.ts", "the sites registry — the one place products are named"],
  ["src/lib/site.ts", "the primary origin and its canonical URLs"],
  ["src/lib/phone.ts", "UNTAGGED_SITE: the site id in every pre-split auth identity"],
  ["src/lib/auth.ts", "localStorage key — renaming signs every customer out"],
  ["src/lib/store.ts", "localStorage key — renaming discards local state"],
  ["src/lib/admin/client.ts", "sessionStorage key for the admin token"],
  ["src/lib/sessions/client.ts", "localStorage key for the host token"],
  ["src/lib/market/engine.ts", "process-global handle, never rendered"],
  ["src/lib/supabase/client.ts", "process-global handle, never rendered"],
  ["src/components/admin/AdminSidebar.tsx", "comment explaining why the console is unbranded"],
]);

/**
 * Splits a file into lines, marking which are inside a comment.
 *
 * Block comments have to be *tracked*, not pattern-matched line by line: the
 * body of a `/* … *​/` block often has no leading marker at all, and treating
 * those lines as code produced a false positive on the very first run of this
 * script. A checker that cries wolf is a checker people start ignoring.
 */
function readLines(source) {
  let inBlock = false;

  return source.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    const startedInBlock = inBlock;

    if (inBlock) {
      if (line.includes("*/")) inBlock = false;
    } else if (line.includes("/*") && !line.includes("*/")) {
      inBlock = true;
    }

    const comment =
      startedInBlock ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*");

    return { line, comment };
  });
}

/**
 * An occurrence inside a longer identifier — `__ventiMarket`, `venti.auth.v1`,
 * `ventitradingfx` — is a name in code, not a name on screen. A word touching
 * an identifier character on either side is one of those.
 */
function isIdentifier(line, index, word) {
  const before = line[index - 1] ?? " ";
  const after = line[index + word.length] ?? " ";
  return /[\w.$-]/.test(before) || /[\w.$-]/.test(after);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(tsx?|css)$/.test(entry)) yield full;
  }
}

const hits = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  if (ALLOWED.has(rel)) continue;

  readLines(readFileSync(file, "utf8")).forEach(({ line, comment }, at) => {
    if (comment) return;

    for (const brand of BRANDS) {
      let index = line.indexOf(brand);
      while (index !== -1) {
        if (!isIdentifier(line, index, brand)) {
          hits.push({ file: rel, line: at + 1, brand, text: line.trim() });
          break;
        }
        index = line.indexOf(brand, index + 1);
      }
    }
  });
}

if (hits.length === 0) {
  console.log("✓ No hardcoded product names in customer-facing code.");
  console.log(`  Checked ${BRANDS.join(", ")} across src/, with ${ALLOWED.size} allowlisted files.`);
  process.exit(0);
}

console.error(`✗ ${hits.length} hardcoded product name${hits.length === 1 ? "" : "s"} found.\n`);
for (const hit of hits) {
  console.error(`  ${hit.file}:${hit.line}`);
  console.error(`    ${hit.text}`);
}
console.error(
  "\n  One build serves every domain, so a hardcoded name is wrong on all but one.",
);
console.error("  Client: useDomainLabel(). Server route: callerDomain(request).");
console.error("  If the occurrence is an identifier and not a name, add the file to ALLOWED.");
process.exit(1);
