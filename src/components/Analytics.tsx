import Script from "next/script";
import { connection } from "next/server";
import { umamiConfig } from "@/lib/umami";

/**
 * The Umami tracker, when configured. Mount it on public pages only. Respects the browser's Do Not Track setting.
 * `connection()` opts the page into per-request rendering, so the environment is read when the server runs and not
 * frozen into the image at build time (the published image is built without these variables).
 */
export async function Analytics() {
  await connection();
  const config = umamiConfig({
    UMAMI_SCRIPT_URL: process.env.UMAMI_SCRIPT_URL,
    UMAMI_WEBSITE_ID: process.env.UMAMI_WEBSITE_ID,
  });
  if (!config) return null;
  return <Script src={config.src} data-website-id={config.websiteId} data-do-not-track="true" strategy="afterInteractive" />;
}
