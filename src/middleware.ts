import NextAuth from "next-auth";
import { authConfig } from "@/server/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  const isPublicApi = pathname.startsWith("/api/public") || pathname.startsWith("/api/auth");

  if (isPublicApi) return;

  if (!isLoggedIn && !isAuthPage) {
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return Response.redirect(url);
  }

  if (isLoggedIn && isAuthPage) {
    return Response.redirect(new URL("/", req.url));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
