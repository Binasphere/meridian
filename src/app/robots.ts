import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * `/robots.txt`.
 *
 * The disallow list is belt and braces, not the actual protection. `robots.txt`
 * is a request to a crawler and nothing more: it does not authenticate anyone,
 * and a URL listed here is a URL published to the world as interesting. The
 * real gates are the passcode on `/admin`, the host token on `/sessions`, and
 * the per-page `robots: { index: false }` on the personal pages. This file
 * exists so that a well-behaved crawler does not waste its budget on routes
 * that render nothing without a session anyway.
 *
 * The paths are named rather than globbed for that reason — a pattern broad
 * enough to be safe would also be broad enough to hide the product.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/sessions",
        "/account",
        "/wallet",
        "/positions",
        "/performance",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/").replace(/\/$/, ""),
  };
}
