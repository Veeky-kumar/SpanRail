import NextAuth from "next-auth";
import { authConfig } from "@/server/auth.config";
import { isAuthPage, isPublicPath } from "@/lib/publicPaths";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isPublicApi = pathname.startsWith("/api/public") || pathname.startsWith("/api/auth") || pathname === "/api/health";

  if (isPublicApi) return;

  if (!isLoggedIn && !isPublicPath(pathname)) {
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return Response.redirect(url);
  }

  if (isLoggedIn && isAuthPage(pathname)) {
    return Response.redirect(new URL("/", req.url));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
