import type { Metadata } from "next";
import { Terminal } from "@/components/terminal/Terminal";

// Canonical is set per indexable page rather than in the layout, which would
// inherit it everywhere — see the note in `layout.tsx`.
export const metadata: Metadata = { alternates: { canonical: "/" } };

/**
 * The root route is the terminal.
 *
 * There is no marketing page and no sign-in wall: an anonymous visitor lands
 * straight on a funded demo account and can place a contract within a second of
 * arriving. Authentication gates the *live* account, when that exists — not the
 * ability to look at the product.
 */
export default function Page() {
  return <Terminal />;
}
