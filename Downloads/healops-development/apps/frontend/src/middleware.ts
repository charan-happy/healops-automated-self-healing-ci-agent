import { NextResponse, type NextRequest } from "next/server";

// Public routes that don't require authentication
const PUBLIC_PATHS = ["/login", "/register", "/unauthorized", "/forbidden", "/auth/callback", "/onboarding", "/invite", "/github/callback"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets, API routes, and special paths
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname === "/unauthorized"
  ) {
    return NextResponse.next();
  }

  // Public paths always allowed
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // For all other routes, the client-side AuthContext handles redirect to /login
  // Middleware just passes through — auth state is managed in the browser via JWT
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
