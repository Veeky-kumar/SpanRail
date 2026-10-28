import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Schibsted_Grotesk, JetBrains_Mono } from "next/font/google";
import { resolveTheme, THEME_COOKIE } from "@/lib/theme";
import { siteUrl } from "@/lib/site";
import { siteMetadata } from "@/lib/siteMetadata";
import "./globals.css";

// One family for the whole app. Numerals are tabular wherever durations are shown
// (the `tabular-nums` class), so columns of milliseconds line up.
const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Monospace only for ids, commands and code.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

// Link-preview and search metadata is built in lib/siteMetadata.ts and depends on SITE_URL (see lib/site.ts).
export function generateMetadata(): Metadata {
  return siteMetadata(siteUrl(), process.env.GOOGLE_SITE_VERIFICATION);
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
