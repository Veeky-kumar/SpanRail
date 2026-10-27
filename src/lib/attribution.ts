// Where a signup came from. Collected in the visitor's browser into a first-party cookie, read once when the
// account is created, and stored on the user. Only a referring *host* and the utm tags are kept: never a path,
// a query string or an IP address.
export interface Attribution {
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

export const SOURCE_COOKIE = "sr_src";
const MAX = 80;

const EMPTY: Attribution = { referrer: null, utmSource: null, utmMedium: null, utmCampaign: null };

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX);
  return text || null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Runs in the browser: the referrer's host (unless it is this site) and the utm tags of the landing URL. */
export function sourceFromLocation(referrer: string, search: string, ownHost: string): Attribution {
  const host = referrer ? hostOf(referrer) : null;
  const own = ownHost.toLowerCase().replace(/^www\./, "");
  const params = new URLSearchParams(search);
  return {
    referrer: host && host !== own ? clean(host) : null,
    utmSource: clean(params.get("utm_source")),
    utmMedium: clean(params.get("utm_medium")),
    utmCampaign: clean(params.get("utm_campaign")),
  };
}

export function serializeSource(a: Attribution): string {
  return encodeURIComponent(JSON.stringify(a));
}

/** The cookie is under the visitor's control, so every field is re-validated on the server. */
export function parseSourceCookie(raw: string | undefined): Attribution {
  if (!raw) return { ...EMPTY };
  try {
    const data: unknown = JSON.parse(decodeURIComponent(raw));
    if (!data || typeof data !== "object" || Array.isArray(data)) return { ...EMPTY };
    const o = data as Record<string, unknown>;
    return {
      referrer: clean(o.referrer),
      utmSource: clean(o.utmSource),
      utmMedium: clean(o.utmMedium),
      utmCampaign: clean(o.utmCampaign),
    };
  } catch {
    return { ...EMPTY };
  }
}

/** A coarse country from the headers an edge network adds. Null when absent or unknown (Cloudflare uses XX and T1). */
export function countryFromHeaders(get: (name: string) => string | null): string | null {
  const raw = get("cf-ipcountry") ?? get("x-vercel-ip-country");
  const code = raw?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code) || code === "XX") return null;
  return code;
}
