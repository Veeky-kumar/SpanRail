import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Schibsted_Grotesk, JetBrains_Mono } from "next/font/google";
import { resolveTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

// One family for the whole app. Numerals are tabular wherever durations are shown
// (the `tabular-nums` class), so columns of milliseconds line up.
const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Monospace only for ids, commands and code.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Tracewell", template: "%s · Tracewell" },
  description: "Self-hosted LLM tracing, evaluation and prompt management, with network timing for every call.",
};

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
