// The public address of this instance, from SITE_URL. It is optional on purpose: a private install should not
// tell search engines to index it, and should not name an address it does not own. Search metadata (canonical
// link, link-preview card, sitemap, structured data) is produced only when SITE_URL is set.
export function siteUrl(): string | null {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}
