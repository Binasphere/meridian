import { Terminal } from "@/components/terminal/Terminal";

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
