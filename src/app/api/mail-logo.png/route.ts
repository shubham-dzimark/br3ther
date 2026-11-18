import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * The shop logo as a PNG, for the email header.
 *
 * Logos are uploaded as WebP (or SVG), and neither survives a mail client -
 * Outlook shows a broken image for WebP and nothing renders SVG. Rather than
 * asking the shop to keep a second copy of its logo in a second format, the
 * one it already has is converted here on the way out, 360px wide (printed
 * at 180, so it stays sharp on a phone), on a transparent ground.
 *
 * Cached in memory against the file's modification time, so a new upload is
 * picked up on the next email and nothing is converted twice.
 */
const WIDTH = 360;
let cache: { key: string; png: Buffer } | null = null;

export async function GET(): Promise<Response> {
  const logo = (await getSettings())[SETTING_KEYS.logoUrl]?.trim() ?? "";
  if (!logo.startsWith("/uploads/") || logo.includes("..")) {
    return new Response("No logo", { status: 404 });
  }

  const file = path.join(process.cwd(), "public", logo);
  let mtime: number;
  try {
    mtime = (await stat(file)).mtimeMs;
  } catch {
    return new Response("No logo", { status: 404 });
  }

  const key = `${logo}:${mtime}`;
  if (!cache || cache.key !== key) {
    try {
      const png = await sharp(await readFile(file), { failOn: "error" })
        .resize({ width: WIDTH, withoutEnlargement: true })
        .png()
        .toBuffer();
      cache = { key, png };
    } catch {
      return new Response("Logo could not be converted", { status: 500 });
    }
  }

  return new Response(new Uint8Array(cache.png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      "Content-Length": String(cache.png.length),
    },
  });
}
