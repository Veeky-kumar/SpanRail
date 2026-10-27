// Umami (https://umami.is) is the only analytics tool, and it is opt-in: without both variables set, no tracker
// is loaded. It is mounted only on the public pages (landing, sign in, sign up), never inside the signed-in app.
export interface UmamiConfig {
  src: string;
  websiteId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function umamiConfig(env: { UMAMI_SCRIPT_URL?: string; UMAMI_WEBSITE_ID?: string }): UmamiConfig | null {
  const src = env.UMAMI_SCRIPT_URL?.trim();
  const websiteId = env.UMAMI_WEBSITE_ID?.trim();
  if (!src || !websiteId || !UUID.test(websiteId)) return null;
  try {
    const url = new URL(src);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    return { src: url.toString(), websiteId };
  } catch {
    return null;
  }
}
