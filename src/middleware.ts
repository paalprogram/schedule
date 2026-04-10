import { NextRequest, NextResponse } from "next/server";

const AUTH_USER = process.env.AUTH_USER || "admin";
const AUTH_PASS = process.env.AUTH_PASS || "changeme";
const COOKIE_NAME = "schedule_auth";
// Simple token: base64 of user:pass — good enough for single-user basic auth
const VALID_TOKEN = Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString("base64");

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow the login page and its API through
  if (pathname === "/login" || pathname === "/api/auth/login") {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  // Check auth cookie
  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie?.value === VALID_TOKEN) {
    return NextResponse.next();
  }

  // Not authenticated — redirect browser requests to login, reject API calls
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
