import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

// One public page worth indexing: the landing page. The rest is behind sign in or is a form.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  if (!base) return [];
  return [{ url: `${base}/`, changeFrequency: "monthly", priority: 1 }];
}
