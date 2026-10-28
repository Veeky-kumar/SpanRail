import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Schibsted_Grotesk, JetBrains_Mono } from "next/font/google";
import { resolveTheme, THEME_COOKIE } from "@/lib/theme";
import { siteUrl } from "@/lib/site";
import "./globals.css";

// One family for the whole app. Numerals are tabular wherever durations are shown
// (the `tabular-nums` class), so columns of milliseconds line up.
const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Monospace only for ids, commands and code.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

const TITLE = "Spanrail: self-hosted LLM observability with per-call timing";
const DESCRIPTION =
  "See where every LLM call spends its time. Self-hosted traces, costs, evals and prompts, plus a gateway that times DNS, connect, TLS and the wait for the first byte.";

// Link-preview and search metadata is added only when SITE_URL is set (see lib/site.ts). Without it the page asks
// search engines not to index it, which is the right default for a private install.
export function generateMetadata(): Metadata {
  const base = siteUrl();
  return {
    title: { default: TITLE, template: "%s · Spanrail" },
    description: DESCRIPTION,
    ...(base
      ? {
          metadataBase: new URL(base),
          openGraph: {
            type: "website",
            siteName: "Spanrail",
            title: TITLE,
            description: DESCRIPTION,
            images: [{ url: "/og.png", width: 1200, height: 630, alt: "Spanrail: see where every LLM call spends its time" }],
          },
          twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og.png"] },
        }
      : { robots: { index: false, follow: false } }),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Light is the default. The cookie is read on the server so the right theme is on <html>
  // before first paint.
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={theme} className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
