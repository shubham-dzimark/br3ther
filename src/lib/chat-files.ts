import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Images in live chat - screenshots and photos from customers and staff.
 *
 * Stored OUTSIDE public/: a chat picture can show an order, an address or a
 * payment screen, so it is only ever served through /api/chat/file, which
 * checks the viewer belongs to that conversation (or is staff).
 *
 * The type is decided by the file's own bytes, never by its name or the
 * browser's claim, and only plain raster formats are accepted - no SVG, which
 * can carry script.
 */

export const CHAT_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_FILE_MAX_COUNT = 4;

const DIR = path.join(process.cwd(), "storage", "chat");

const TYPES = [
  { ext: "png", mime: "image/png", test: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "jpg", mime: "image/jpeg", test: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "gif", mime: "image/gif", test: (b: Buffer) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  {
    ext: "webp",
    mime: "image/webp",
    test: (b: Buffer) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
] as const;

const NAME = /^[a-f0-9]{32}\.(png|jpg|gif|webp)$/;

export function isChatFileName(name: string): boolean {
  return NAME.test(name);
}

export function mimeForChatFile(name: string): string {
  const ext = name.split(".").pop();
  return TYPES.find((t) => t.ext === ext)?.mime ?? "application/octet-stream";
}

export function chatFileUrl(name: string): string {
  return `/api/chat/file/${name}`;
}

/** Store one image. Returns its name, or null when it is not an accepted image. */
export async function saveChatImage(buf: Buffer): Promise<string | null> {
  if (buf.length === 0 || buf.length > CHAT_FILE_MAX_BYTES) return null;
  const type = TYPES.find((t) => t.test(buf));
  if (!type) return null;
  const name = `${randomBytes(16).toString("hex")}.${type.ext}`;
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, name), buf, { flag: "wx" });
  return name;
}

/** Store the images from a form (staff reply). Non-images and empties are ignored. */
export async function saveChatUploads(files: File[]): Promise<{ names: string[]; error?: string }> {
  const real = files.filter((f) => f && typeof f === "object" && f.size > 0).slice(0, CHAT_FILE_MAX_COUNT);
  const names: string[] = [];
  for (const file of real) {
    if (file.size > CHAT_FILE_MAX_BYTES) return { names, error: "too_big" };
    const name = await saveChatImage(Buffer.from(await file.arrayBuffer()));
    if (!name) return { names, error: "not_image" };
    names.push(name);
  }
  return { names };
}

export async function chatFileExists(name: string): Promise<boolean> {
  if (!isChatFileName(name)) return false;
  return stat(path.join(DIR, name)).then(
    (s) => s.isFile(),
    () => false,
  );
}

export async function readChatFile(name: string): Promise<Buffer | null> {
  if (!isChatFileName(name)) return null;
  return readFile(path.join(DIR, name)).catch(() => null);
}

/** Keep only names that are well-formed and actually stored. */
export async function validChatFiles(names: unknown): Promise<string[]> {
  if (!Array.isArray(names)) return [];
  const out: string[] = [];
  for (const n of names.slice(0, CHAT_FILE_MAX_COUNT)) {
    if (typeof n === "string" && (await chatFileExists(n)) && !out.includes(n)) out.push(n);
  }
  return out;
}
