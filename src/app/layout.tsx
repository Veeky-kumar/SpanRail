import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tracewell",
  description: "Self-hostable LLM observability, evaluation, and prompt management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
