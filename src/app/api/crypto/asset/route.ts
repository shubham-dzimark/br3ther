import { fetchAsset, getCryptoConfig, METHOD_KEY_RE } from "@/lib/crypto-pay";

export const dynamic = "force-dynamic";

/**
 * Image proxy for crypto method logos and wallet QR codes
 * (class-crypto-proxy.php). The browser asks us; we fetch from the portal with
 * our keys and stream the bytes back, so the portal address and keys never
 * reach the client.
 *
 *   GET /api/crypto/asset?type=logo|qr&method=<method_key>
 */
export async function GET(request: Request): Promise<Response> {
  const notFound = () => new Response(null, { status: 404 });
  const url = new URL(request.url);
  const type = (url.searchParams.get("type") ?? "").toLowerCase();
  const method = url.searchParams.get("method") ?? "";

  // The valid methods belong to the portal; here only the shape is enforced.
  if ((type !== "logo" && type !== "qr") || !METHOD_KEY_RE.test(method)) return notFound();

  const cfg = await getCryptoConfig();
  if (!cfg.active) return notFound();

  const asset = await fetchAsset(cfg, type, method);
  if (!asset) return notFound();

  // Only image types are re-emitted as themselves.
  const mime = asset.mime.toLowerCase().startsWith("image/") ? asset.mime : "application/octet-stream";

  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
  };
  // An SVG opened directly would run script on this origin; sandbox it.
  if (mime.toLowerCase().includes("svg")) {
    headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }

  return new Response(asset.body, { status: 200, headers });
}
