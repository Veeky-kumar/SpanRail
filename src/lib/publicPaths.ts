// Which paths a signed-out visitor may open. Everything else redirects to /login (see middleware.ts).
// Matching is exact on purpose: a prefix match here would quietly open private pages.
const AUTH_PAGES = ["/login", "/signup"];
const PUBLIC_EXACT = ["/", ...AUTH_PAGES, "/icon.svg"];

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.includes(pathname);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.includes(pathname);
}
