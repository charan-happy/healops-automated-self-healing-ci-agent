import { NextResponse, type NextRequest } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";

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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${BACKEND_URL}/v1/healops/onboarding/status`, {
      signal: controller.signal,
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
    });
    clearTimeout(timeoutId);

    // Backend unreachable or error — fail open, let user through
    if (!res.ok) {
      return NextResponse.next();
    }

    const body = (await res.json()) as {
      data?: { isComplete?: boolean };
    };
    const isComplete = body?.data?.isComplete === true;

    // Completed user trying to access /onboarding → redirect to /dashboard
    if (pathname.startsWith("/onboarding") && isComplete) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // Incomplete user trying to access dashboard routes → redirect to /onboarding
    if (!pathname.startsWith("/onboarding") && !isComplete) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  } catch {
    // Backend unreachable — fail open
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
