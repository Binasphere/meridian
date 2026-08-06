import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, absoluteUrl } from "@/lib/site";

/**
 * `/sitemap.xml`, generated at build time by Next from `PUBLIC_ROUTES`.
 *
 * A route file rather than a hand-written `public/sitemap.xml` so that the list
 * of indexable pages lives in exactly one place. A static XML file is a second
 * copy of that list which nothing checks, and it goes stale the first time a
 * route is added or a page is put behind auth.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map(({ path, lastModified }) => ({
    url: absoluteUrl(path),
    lastModified,
  }));
}
