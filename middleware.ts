import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import type { PermissionKey } from "@/lib/types";

const protectedPaths = [
  "/dashboard",
  "/job-application",
  "/interview",
  "/chat",
  "/settings",
  "/profile",
  "/profiles",
  "/admin",
];

const routePermissions: Array<{ path: string; permission: PermissionKey }> = [
  { path: "/dashboard", permission: "view_dashboard" },
  { path: "/job-application", permission: "view_job_application" },
  { path: "/interview", permission: "view_interview" },
  { path: "/chat", permission: "view_chat" },
  { path: "/settings", permission: "view_settings" },
  { path: "/profiles", permission: "view_profiles" },
  { path: "/profile", permission: "view_profile" },
  { path: "/admin", permission: "view_admin" },
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const rawSession = request.cookies.get("nex_session")?.value;
  const hasSession = Boolean(rawSession);
  const session = rawSession ? parseSessionCookie(rawSession) : null;

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = hasSession ? "/dashboard" : "/login";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (protectedPaths.some((path) => pathname.startsWith(path)) && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const routePermission = routePermissions.find((route) =>
    pathname.startsWith(route.path),
  );

  if (
    hasSession &&
    routePermission &&
    session?.permissions &&
    !(session.user?.role === "admin" && routePermission.permission === "view_settings") &&
    !session.permissions.includes(routePermission.permission)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/job-application/:path*",
    "/interview/:path*",
    "/chat/:path*",
    "/settings/:path*",
    "/profile/:path*",
    "/profiles/:path*",
    "/admin/:path*",
  ],
};

function parseSessionCookie(value: string) {
  try {
    return JSON.parse(value) as {
      permissions?: PermissionKey[];
      user?: { role?: string };
    };
  } catch {
    return null;
  }
}
