import "server-only";
import { lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/*
 * The storefront theme editor: read, save and version the Br3thr design
 * files from the admin, then ask the server to rebuild.
 *
 * Only two folders are reachable, each with its own whitelist of extensions,
 * and every path is resolved and checked against its folder before use, so a
 * crafted name cannot climb out of the theme into .env or the database code.
 * Code changes go live only on Publish (a full rebuild); images are served
 * straight from disk by Nginx, so they change at once.
 */

export const APP_ROOT = process.env.APP_ROOT ?? process.cwd();

/** Where history, the publish request and its status/log live. Writable by the app. */
export const PUBLISH_DIR = process.env.PUBLISH_DIR ?? "/var/www/br3thr-publish";
const HISTORY_DIR = path.join(PUBLISH_DIR, "history");

export type ThemeRoot = "code" | "images";

const ROOTS: Record<ThemeRoot, { dir: string; ext: string[]; maxBytes: number }> = {
  code: {
    dir: "src/components/br3thr",
    ext: [".tsx", ".ts", ".css"],
    maxBytes: 512 * 1024,
  },
  images: {
    dir: "public/br3thr",
    ext: [".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg", ".ico"],
    maxBytes: 8 * 1024 * 1024,
  },
};

export const IMAGE_EXT = ROOTS.images.ext;
export const CODE_EXT = ROOTS.code.ext;
export const IMAGE_MAX_BYTES = ROOTS.images.maxBytes;

export class ThemeError extends Error {}

function rootDir(root: ThemeRoot): string {
  return path.join(APP_ROOT, ROOTS[root].dir);
}

/** A file name inside one root: plain characters, no folders, a whitelisted extension. */
export function safeName(root: ThemeRoot, name: string): string {
  const n = name.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(n) || n.includes("..")) {
    throw new ThemeError("Use letters, numbers, dots, dashes and underscores only.");
  }
  if (!ROOTS[root].ext.includes(path.extname(n).toLowerCase())) {
    throw new ThemeError(`Allowed file types: ${ROOTS[root].ext.join(", ")}`);
  }
  return n;
}

/** Absolute path, refusing anything that resolves outside the root or is a link. */
async function resolve(root: ThemeRoot, name: string, mustExist: boolean): Promise<string> {
  const dir = rootDir(root);
  const full = path.resolve(dir, safeName(root, name));
  if (path.dirname(full) !== dir) throw new ThemeError("Not a theme file.");
  try {
    const s = await lstat(full);
    if (!s.isFile()) throw new ThemeError("Not a regular file.");
  } catch (e) {
    if (e instanceof ThemeError) throw e;
    if (mustExist) throw new ThemeError("That file does not exist.");
  }
  return full;
}

export type ThemeFile = { name: string; size: number; modified: number };

export async function listFiles(root: ThemeRoot): Promise<ThemeFile[]> {
  const dir = rootDir(root);
  const names = await readdir(dir).catch(() => [] as string[]);
  const out: ThemeFile[] = [];
  for (const name of names) {
    if (!ROOTS[root].ext.includes(path.extname(name).toLowerCase())) continue;
    const s = await lstat(path.join(dir, name));
    if (s.isFile()) out.push({ name, size: s.size, modified: s.mtimeMs });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readCode(name: string): Promise<{ content: string; modified: number }> {
  const full = await resolve("code", name, true);
  const [content, s] = await Promise.all([readFile(full, "utf8"), stat(full)]);
  return { content, modified: s.mtimeMs };
}

/* ---------- history ---------- */

function historyDir(root: ThemeRoot, name: string): string {
  return path.join(HISTORY_DIR, root, name);
}

/** Copies the current file into history before it is overwritten or removed. */
async function snapshot(root: ThemeRoot, name: string, full: string, by: string): Promise<void> {
  const exists = await stat(full).catch(() => null);
  if (!exists) return;
  const dir = historyDir(root, name);
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const who = by.replace(/[^A-Za-z0-9@._-]/g, "_").slice(0, 60);
  await writeFile(path.join(dir, `${stamp}__${who}`), await readFile(full));
  // Fifty versions per file is weeks of editing; older ones are pruned.
  const all = (await readdir(dir)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 50))) {
    await rm(path.join(dir, old), { force: true });
  }
}

export type Revision = { id: string; at: string; by: string };

export async function listRevisions(root: ThemeRoot, name: string): Promise<Revision[]> {
  safeName(root, name);
  const names = await readdir(historyDir(root, name)).catch(() => [] as string[]);
  return names
    .sort()
    .reverse()
    .map((id) => {
      const [stamp, by = ""] = id.split("__");
      // 2026-10-31T09-12-03-123Z -> 2026-10-31T09:12:03.123Z
      const at = stamp.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, "T$1:$2:$3.$4Z");
      return { id, at, by };
    });
}

export async function readRevision(root: ThemeRoot, name: string, id: string): Promise<Buffer> {
  if (!/^[0-9TZ-]+__[A-Za-z0-9@._-]*$/.test(id)) throw new ThemeError("Unknown version.");
  return readFile(path.join(historyDir(root, name), id));
}

/* ---------- writes ---------- */

/** Atomic write: a half-written component would break the next build. */
async function put(full: string, data: string | Buffer): Promise<void> {
  const tmp = `${full}.tmp-${process.pid}`;
  await writeFile(tmp, data);
  await rename(tmp, full);
}

export async function saveCode(
  name: string,
  content: string,
  by: string,
  opts: { create?: boolean; expectModified?: number } = {},
): Promise<number> {
  const full = await resolve("code", name, !opts.create);
  if (Buffer.byteLength(content) > ROOTS.code.maxBytes) throw new ThemeError("File is too large.");
  const current = await stat(full).catch(() => null);
  if (opts.create && current) throw new ThemeError("A file with that name already exists.");
  // Two people editing one file: refuse rather than silently drop the other's work.
  if (current && opts.expectModified && Math.abs(current.mtimeMs - opts.expectModified) > 1) {
    throw new ThemeError("This file was changed by someone else since you opened it. Reload to see their version.");
  }
  await snapshot("code", name, full, by);
  await put(full, content.replace(/\r\n/g, "\n"));
  return (await stat(full)).mtimeMs;
}

export async function saveImage(name: string, data: Buffer, by: string): Promise<void> {
  const full = await resolve("images", name, false);
  if (data.length > ROOTS.images.maxBytes) throw new ThemeError("Image is larger than 8 MB.");
  await snapshot("images", name, full, by);
  await put(full, data);
}

export async function deleteFile(root: ThemeRoot, name: string, by: string): Promise<void> {
  const full = await resolve(root, name, true);
  await snapshot(root, name, full, by);
  await rm(full, { force: true });
}

export async function restoreRevision(root: ThemeRoot, name: string, id: string, by: string): Promise<void> {
  const data = await readRevision(root, name, id);
  const full = await resolve(root, name, false);
  await snapshot(root, name, full, by);
  await put(full, data);
}

/* ---------- publish ---------- */

export type PublishStatus = {
  state: "idle" | "queued" | "running" | "success" | "failed";
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  by?: string;
};

export async function publishStatus(): Promise<PublishStatus> {
  const raw = await readFile(path.join(PUBLISH_DIR, "status.json"), "utf8").catch(() => null);
  const queued = await stat(path.join(PUBLISH_DIR, "request")).catch(() => null);
  let s: PublishStatus = { state: "idle" };
  if (raw) {
    try {
      s = JSON.parse(raw) as PublishStatus;
    } catch {
      /* a status mid-write reads as idle for one poll */
    }
  }
  // A request newer than the last run's start has not been picked up yet.
  if (queued && s.state !== "running" && (!s.startedAt || queued.mtimeMs > Date.parse(s.startedAt))) {
    return { ...s, state: "queued" };
  }
  return s;
}

export async function publishLog(): Promise<string> {
  const log = await readFile(path.join(PUBLISH_DIR, "publish.log"), "utf8").catch(() => "");
  return log.slice(-20000);
}

/** When the live build was made: code saved after this is not on the shop yet. */
export async function liveBuildTime(): Promise<number | null> {
  const s = await stat(path.join(APP_ROOT, ".next", "BUILD_ID")).catch(() => null);
  return s ? s.mtimeMs : null;
}

/**
 * Asks the server to rebuild. The app itself cannot restart its own service, so
 * it only writes a request file; a systemd path unit watching that file runs
 * the publish script as root (see deploy/br3thr-publish.sh).
 */
export async function requestPublish(by: string): Promise<void> {
  const s = await publishStatus();
  if (s.state === "running" || s.state === "queued") throw new ThemeError("A publish is already in progress.");
  await mkdir(PUBLISH_DIR, { recursive: true });
  await writeFile(path.join(PUBLISH_DIR, "request"), JSON.stringify({ by, at: new Date().toISOString() }));
}
