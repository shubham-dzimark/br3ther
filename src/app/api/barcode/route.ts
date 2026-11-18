import { BARCODE_FORMATS, renderBarcodePng, type BarcodeFormat } from "@/lib/barcode";

export const dynamic = "force-dynamic";

/**
 * Barcode as a PNG.
 *
 * Public on purpose: its only consumer is an <img> inside an order email, and
 * a mail client cannot sign in. Nothing is looked up here - the endpoint draws
 * the text it is handed, so it exposes no customer or catalogue data. Input is
 * held to a safe charset, a length limit and the symbologies the shop uses, and
 * responses are immutable so a mail client caches rather than re-fetches.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const code = (params.get("code") ?? "").trim();
  const rawFormat = params.get("format") ?? "code128";

  if (!code || code.length > 200) {
    return new Response("Bad code.", { status: 400 });
  }
  // Letters, digits and the punctuation a SKU or product URL can contain.
  if (!/^[A-Za-z0-9 ._:/?=&%#+-]+$/.test(code)) {
    return new Response("Bad code.", { status: 400 });
  }
  const format = BARCODE_FORMATS.find((f) => f.value === rawFormat)?.value as
    | BarcodeFormat
    | undefined;
  if (!format) return new Response("Unknown format.", { status: 400 });

  const clamp = (value: string | null, min: number, max: number, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  };

  const png = await renderBarcodePng(code, format, {
    height: clamp(params.get("h"), 4, 40, 10),
    scale: clamp(params.get("s"), 1, 6, 3),
  });
  if (!png) return new Response("That code does not fit that format.", { status: 422 });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(png.length),
    },
  });
}
