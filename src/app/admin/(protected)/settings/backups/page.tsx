import type { Metadata } from "next";
import { requireCapability } from "@/lib/permissions";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { listBackups, BACKUP_DIR } from "@/lib/backup";
import { SectionCard, Field, fieldInput } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { IconTrash } from "@/components/admin/Icons";
import { deleteBackup, runBackupNow, saveBackupSettings } from "./actions";
import { getTimeZone, ymdhm, tzLabel } from "@/lib/timezone";

export const metadata: Metadata = { title: "Backups" };
export const dynamic = "force-dynamic";

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function BackupsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; detail?: string }>;
}) {
  const me = await requireCapability("settings");
  const tz = await getTimeZone();
  const [sp, s, files] = await Promise.all([
    searchParams,
    getSettings(),
    listBackups(),
  ]);

  const isOwner = me.role === "OWNER";
  const serverNow = ymdhm(new Date(), tz).slice(11);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Backups
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          A nightly archive of the code, uploaded media and the whole database.
        </p>
      </div>

      {!isOwner ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Only a Master can create or download backups &mdash; an archive contains
          every customer record and the admin password hashes.
        </p>
      ) : null}

      {sp.error === "run" ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          That backup failed: {sp.detail ?? "unknown error"}
        </p>
      ) : null}
      {sp.saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {sp.saved === "backup" ? "Backup created." : "Saved."}
        </p>
      ) : null}

      <SectionCard
        title="Available backups"
        action={
          isOwner ? (
            <form action={runBackupNow}>
              <button type="submit" className={btnPrimary}>
                Back up now
              </button>
            </form>
          ) : null
        }
      >
        {files.length === 0 ? (
          <p className="text-sm text-slate-500">
            No backups yet. They appear here once the nightly job runs, or use
            &ldquo;Back up now&rdquo;.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {files.map((f) => (
              <li key={f.name} className="flex flex-wrap items-center gap-3 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {f.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {ymdhm(f.createdAt, tz)} &middot;{" "}
                    {size(f.sizeBytes)}
                  </p>
                </div>

                {isOwner ? (
                  <>
                    <a
                      href={`/api/admin/backups/download?name=${encodeURIComponent(f.name)}`}
                      className="rounded-full border border-[var(--admin-accent)] px-4 py-1.5 text-xs font-semibold text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
                    >
                      Download
                    </a>
                    <form action={deleteBackup}>
                      <input type="hidden" name="name" value={f.name} />
                      <button
                        type="submit"
                        aria-label={`Delete ${f.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <IconTrash className="h-[17px] w-[17px]" />
                      </button>
                    </form>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
          Stored on the server at{" "}
          <code className="rounded bg-slate-100 px-1">{BACKUP_DIR}</code>, outside
          the web root so nothing can be fetched without signing in. Each archive
          carries a <code className="rounded bg-slate-100 px-1">RESTORE.md</code>{" "}
          with the exact steps to bring the shop up on another server.
        </p>
      </SectionCard>

      {isOwner ? (
        <SectionCard title="Schedule">
          <form action={saveBackupSettings} className="space-y-7">
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input
                type="checkbox"
                name="backupEnabled"
                defaultChecked={s[SETTING_KEYS.backupEnabled] !== "0"}
                className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
              />
              <span className="text-sm text-slate-700">
                Run the nightly backup
                <span className="mt-0.5 block text-xs text-slate-500">
                  Cron checks every 15 minutes and runs it once the time below
                  has passed. If the server was down at that moment, it catches
                  up on the next check rather than skipping the day.
                </span>
              </span>
            </label>

            {/* Two columns, each with its own note underneath, so the
                explanations line up with the field they describe. */}
            <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
              <div>
                <Field label="Run at (store time)" htmlFor="backupTime">
                  <input
                    id="backupTime"
                    name="backupTime"
                    type="time"
                    defaultValue={s[SETTING_KEYS.backupTime] || "03:17"}
                    className={fieldInput}
                  />
                </Field>
                <p className="mt-2 px-1 text-xs text-slate-500">
                  Store clock is currently{" "}
                  <strong className="text-slate-700">
                    {serverNow} {tzLabel(new Date(), tz)}
                  </strong>
                  .
                </p>
              </div>

              <div>
                <Field label="How many to keep" htmlFor="backupKeep">
                  <input
                    id="backupKeep"
                    name="backupKeep"
                    type="number"
                    min="1"
                    max="30"
                    defaultValue={s[SETTING_KEYS.backupKeep] || "1"}
                    className={fieldInput}
                  />
                </Field>
                <p className="mt-2 px-1 text-xs text-slate-500">
                  Older archives go only after a new one is written, so a failed
                  run never leaves you with nothing. At 1, a corrupted night
                  replaces your only copy.
                </p>
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3.5">
              <input
                type="checkbox"
                name="backupIncludeEnv"
                defaultChecked={s[SETTING_KEYS.backupIncludeEnv] === "1"}
                className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
              />
              <span className="text-sm text-amber-900">
                Include the .env file
                <span className="mt-0.5 block text-xs text-amber-800">
                  Makes a restore turnkey, but puts your database password and
                  push private key inside a downloadable file. Off by default;
                  a <code className="rounded bg-white px-1">.env.example</code> is
                  always included instead.
                </span>
              </span>
            </label>

            <button type="submit" className={btnPrimary}>
              Save
            </button>
          </form>
        </SectionCard>
      ) : null}
    </div>
  );
}
