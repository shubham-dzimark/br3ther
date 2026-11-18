import "server-only";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getTimeZone, ymd, ymdhm, zonedStart } from "@/lib/timezone";

/*
 * Outside the web root, so nothing here is ever served directly.
 *
 * Not /var/backups: the systemd unit runs with ProtectSystem=strict and only
 * grants write access to the paths it lists, so a write elsewhere under /var
 * fails with EROFS. This directory is a sibling of the app rather than a child
 * of it, for two reasons: nothing under it can be reached through the public/
 * folder, and a deploy that syncs with --delete cannot sweep the archives away.
 * The unit grants it explicitly via ReadWritePaths. Override with BACKUP_DIR if
 * the unit is later given another path.
 */
export const BACKUP_DIR =
  process.env.BACKUP_DIR ?? "/var/www/br3thr-backups";
const APP_ROOT = process.env.APP_ROOT ?? process.cwd();
const PREFIX = "br3thr-backup-";

export type BackupFile = {
  name: string;
  sizeBytes: number;
  createdAt: Date;
};

/** Run a command with an argument array - never a shell string, so nothing
 *  from settings can be interpreted as a command. */
function run(cmd: string, args: string[], outFile?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", outFile ?? "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(0, 400)}`)),
    );
  });
}

/**
 * Prisma appends query parameters like `?schema=public` that pg_dump rejects
 * outright ("invalid URI query parameter"). Strip the ones it cannot parse.
 */
function pgUrl(): string {
  const raw = process.env.DATABASE_URL ?? "";
  return raw.replace(/[?&](schema|connection_limit|pgbouncer|sslaccept)=[^&]*/g, (m) =>
    m.startsWith("?") ? "?" : "",
  ).replace(/[?&]$/, "");
}

function restoreDoc(name: string): string {
  return `# Restoring ${name}

This archive is a complete copy of the shop: application code, uploaded media
and the full database. It does NOT contain node_modules or the .next build -
both are regenerated below - and it does not contain the real .env unless the
backup was created with secrets included.

## 1. Put the files in place

    mkdir -p /var/www/br3thr
    tar xzf ${name} -C /var/www/br3thr

## 2. Create the database and load the dump

    sudo -u postgres createdb br3thr
    sudo -u postgres psql -d br3thr -f /var/www/br3thr/database.sql

## 3. Environment

Copy .env.example to .env and fill in every value:

  DATABASE_URL              postgres connection string for the new server
  NEXT_PUBLIC_SITE_URL      the public URL, e.g. https://example.com
  CRON_SECRET               any long random string
  VAPID_PUBLIC_KEY          push keys - regenerate with: npx web-push generate-vapid-keys
  NEXT_PUBLIC_VAPID_PUBLIC_KEY
  VAPID_PRIVATE_KEY
  VAPID_SUBJECT             mailto: address

## 4. Build and run

    cd /var/www/br3thr
    npm ci
    npx prisma generate
    npx prisma migrate deploy
    npm run build
    npm start

## 5. Also needed on the new server

- A web server in front (Apache/nginx) terminating TLS and proxying to the app
- A systemd unit so it restarts on boot
- A crontab entry for the backup and the two existing cron endpoints

Store settings, products, orders, customers and media all travel inside the
database dump and the uploads folder, so the shop comes back configured.
`;
}

/** Newest first. */
export async function listBackups(): Promise<BackupFile[]> {
  try {
    const names = await readdir(BACKUP_DIR);
    const files = await Promise.all(
      names
        .filter((n) => n.startsWith(PREFIX) && n.endsWith(".tar.gz"))
        .map(async (name) => {
          const s = await stat(path.join(BACKUP_DIR, name));
          return { name, sizeBytes: s.size, createdAt: s.mtime };
        }),
    );
    return files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch {
    return [];
  }
}

/**
 * Create one archive containing the code, uploads and a database dump, then
 * delete older ones beyond `keep`.
 *
 * Pruning happens only after the new archive is written, so a failure never
 * leaves the store with nothing.
 */
export async function createBackup(options: {
  keep: number;
  includeEnv: boolean;
}): Promise<BackupFile> {
  /*
   * 0700 on the directory. The archive inside contains a full database dump
   * and, when the .env option is on, every secret the shop holds - so it must
   * not be readable by other local accounts.
   */
  await mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  await chmod(BACKUP_DIR, 0o700).catch(() => undefined);
  const staging = await mkdtemp(path.join(tmpdir(), "nl-backup-"));

  try {
    // Named in store time so the archive name matches the schedule that made
    // it - an "03:00" backup called ...10-00 was needlessly confusing.
    const stamp = ymdhm(new Date(), await getTimeZone()).replace(/[: ]/g, "-");
    const name = `${PREFIX}${stamp}.tar.gz`;
    const target = path.join(BACKUP_DIR, name);

    // --- database
    const { open } = await import("node:fs/promises");
    const sqlPath = path.join(staging, "database.sql");
    const handle = await open(sqlPath, "w");
    try {
      await run("pg_dump", [pgUrl(), "--no-owner", "--no-privileges"], handle.fd);
    } finally {
      await handle.close();
    }

    // --- docs and env template
    await writeFile(path.join(staging, "RESTORE.md"), restoreDoc(name), "utf8");
    const envKeys = [
      "DATABASE_URL",
      "NEXT_PUBLIC_SITE_URL",
      "NODE_ENV",
      "CRON_SECRET",
      "VAPID_PUBLIC_KEY",
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
    ];
    await writeFile(
      path.join(staging, ".env.example"),
      envKeys.map((k) => `${k}=`).join("\n") + "\n",
      "utf8",
    );

    /*
     * One flat archive: the staging files plus the application tree. Secrets
     * are excluded unless explicitly requested - the archive is downloadable,
     * and .env holds the database password and the VAPID private key.
     */
    const excludes = [
      "--exclude=./node_modules",
      "--exclude=./.next",
      // The previous and incoming builds the Theme Editor's publish keeps
      // beside .next - regenerated by a build, like .next itself.
      "--exclude=./.next.prev",
      "--exclude=./.next.new",
      "--exclude=./.git",
      // The app user's home is the app folder, so npm's download cache and
      // tool caches land here; they were over 90% of an archive.
      "--exclude=./.npm",
      "--exclude=./.cache",
      "--exclude=./.config",
      "--exclude=./tsconfig.tsbuildinfo",
      ...(options.includeEnv ? [] : ["--exclude=./.env", "--exclude=./.env.*"]),
    ];

    await run("tar", [
      "czf",
      target,
      "-C",
      staging,
      "database.sql",
      "RESTORE.md",
      ".env.example",
      "-C",
      APP_ROOT,
      ...excludes,
      ".",
    ]);

    /*
     * tar creates the archive with the process umask, which left it 0644 -
     * tightening the directory once by hand was not persistent, because every
     * scheduled run wrote a fresh world-readable file into it.
     */
    await chmod(target, 0o600).catch(() => undefined);

    const s = await stat(target);

    // --- prune, only now that the new archive exists
    const keep = Math.max(1, Math.floor(options.keep));
    const all = await listBackups();
    for (const old of all.slice(keep)) {
      await rm(path.join(BACKUP_DIR, old.name), { force: true });
    }

    return { name, sizeBytes: s.size, createdAt: s.mtime };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/**
 * Whether a scheduled backup is due.
 *
 * The app cannot rewrite root's crontab, so cron ticks every 15 minutes and
 * this decides. A run is due once the configured time has passed and no
 * archive exists from after it - which also means a machine that was down at
 * the appointed hour still backs up on the next tick, rather than skipping
 * the day entirely.
 *
 * The time is the store's, not the server's. setHours() would have read it in
 * the server's zone - UTC here - so "03:00" meant 8pm the previous evening in
 * Vancouver, which is not what the field says.
 */
export async function backupDue(
  timeOfDay: string,
  now: Date = new Date(),
  tz?: string,
): Promise<{ due: boolean; reason: string }> {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(timeOfDay.trim());
  if (!match) return { due: false, reason: `invalid time "${timeOfDay}"` };

  const zone = tz ?? (await getTimeZone());
  const [y, m, d] = ymd(now, zone).split("-").map(Number);
  const target = zonedStart(zone, y, m, d, Number(match[1]), Number(match[2]));

  if (now < target) {
    return { due: false, reason: `not yet ${timeOfDay}` };
  }

  const [newest] = await listBackups();
  if (newest && newest.createdAt >= target) {
    return { due: false, reason: "already backed up since the scheduled time" };
  }

  return { due: true, reason: "due" };
}
