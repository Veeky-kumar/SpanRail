import type { Metadata } from "next";

const TITLE = "Spanrail: self-hosted LLM observability with per-call timing";
const DESCRIPTION =
  "See where every LLM call spends its time. Self-hosted traces, costs, evals and prompts, plus a gateway that times DNS, connect, TLS and the wait for the first byte.";

// Google gives a Search Console verification token made of letters, digits, hyphens and underscores. Anything else
// is ignored rather than written into the page.
export function cleanVerificationToken(raw: string | undefined): string | undefined {
  const token = raw?.trim();
  return token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : undefined;
}

// Link-preview and search metadata is added only when SITE_URL is set (see lib/site.ts). Without it the page asks
// search engines not to index it, which is the right default for a private install.
export function siteMetadata(base: string | null, googleVerification?: string): Metadata {
  if (!base) {
    return {
      title: { default: TITLE, template: "%s · Spanrail" },
      description: DESCRIPTION,
      robots: { index: false, follow: false },
    };
  }
  const google = cleanVerificationToken(googleVerification);
  return {
    title: { default: TITLE, template: "%s · Spanrail" },
    description: DESCRIPTION,
    metadataBase: new URL(base),
    openGraph: {
      type: "website",
      siteName: "Spanrail",
      title: TITLE,
      description: DESCRIPTION,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Spanrail: see where every LLM call spends its time" }],
    },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og.png"] },
    ...(google ? { verification: { google } } : {}),
  };
}
