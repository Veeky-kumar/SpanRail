import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Read at request time: SITE_URL is a runtime setting, not a build-time one.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  // No SITE_URL means a private install: ask crawlers to stay away from all of it.
  if (!base) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/projects/", "/admin/"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
