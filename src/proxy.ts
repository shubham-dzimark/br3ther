import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SITE = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com");

// Only the entry points a shared invite link can land on.
const REF_PATHS = new Set(["/referral", "/account/register", "/shop", "/"]);

/**
 * Two jobs, both before the page renders.
 *
 * 1. www.br3thr.com answers with the same pages as br3thr.com, which search
 *    engines see as a duplicate copy of the whole shop. Every www request is
 *    sent permanently to the main address, path and query kept. The target is
 *    the configured site URL, never the incoming Host header.
 *
 * 2. Parks a referral code from a shared /referral?ref=CODE link in a cookie so
 *    it survives registration and reaches the checkout on its own. This has to
 *    live here rather than in the page: Server Components can read cookies but
 *    cannot set them. Not httpOnly on purpose - it's a marketing attribution
 *    hint, validated server-side at checkout, so a forged cookie buys nothing.
 */
export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  if (host === `www.${SITE.hostname}`) {
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, SITE.origin);
    return NextResponse.redirect(target, 301);
  }

  const response = NextResponse.next();
  const ref = REF_PATHS.has(request.nextUrl.pathname)
    ? request.nextUrl.searchParams.get("ref")
    : null;

  if (ref) {
    const clean = ref.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
    if (clean) {
      response.cookies.set("nl_ref", clean, {
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
        path: "/",
      });
    }
  }

  return response;
}

export const config = {
  // Every page, but not the API or the Pay Portal's WordPress-style callback
  // path (payment callbacks and webhooks must never be redirected), build
  // assets or uploads.
  matcher: ["/((?!api/|wp-json/|_next/|uploads/|favicon.ico).*)"],
};
