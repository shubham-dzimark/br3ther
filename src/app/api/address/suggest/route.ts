import { clientIp } from "@/lib/client-ip";
import {
  allowLookup,
  LOOKUP_MAX_CHARS,
  LOOKUP_MIN_CHARS,
  suggestAddresses,
} from "@/lib/address-lookup";

export const dynamic = "force-dynamic";

/**
 * Address suggestions for the checkout's street field.
 *
 *   GET /api/address/suggest?q=<3+ characters>&country=CA
 *
 * Proxies Geoapify with the key held in the store settings, so the key never
 * reaches the browser. Refuses other sites' pages and rate-limits each visitor
 * so nobody can spend the shop's lookup allowance.
 */
export async function GET(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };

  // Only our own pages may use it: a script on another site gets nothing.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ results: [], error: "forbidden" }, { status: 403, headers });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const country = (url.searchParams.get("country") ?? "CA").trim().toUpperCase();

  if (q.length < LOOKUP_MIN_CHARS || q.length > LOOKUP_MAX_CHARS) {
    return Response.json({ results: [] }, { headers });
  }

  if (!allowLookup((await clientIp()) ?? "unknown")) {
    return Response.json({ results: [], error: "slow_down" }, { status: 429, headers });
  }

  const outcome = await suggestAddresses(q, country);
  if (!outcome.ok) {
    const status = outcome.error === "disabled" ? 404 : outcome.error === "bad_request" ? 400 : 502;
    return Response.json({ results: [], error: outcome.error }, { status, headers });
  }
  return Response.json({ results: outcome.results }, { headers });
}
