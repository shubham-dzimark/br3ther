import Link from "next/link";
import {
  CODE_EXT,
  ThemeError,
  listFiles,
  listRevisions,
  liveBuildTime,
  publishStatus,
  readCode,
  readRevision,
} from "@/lib/theme-editor";
import { PageHeader, btnGhost, btnPrimary, inputCls } from "@/components/admin/ui";
import { CodeEditor, ImageUpload, PublishPanel } from "@/components/admin/ThemeEditorClient";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";
import { createThemeFile, deleteThemeFile, publishTheme, restoreThemeRevision } from "@/app/admin/(protected)/content/theme/actions";

const PAGE = "/admin/content/theme";

const NOTES: Record<string, string> = {
  created: "File created.",
  deleted: "File deleted. A copy is kept in its history.",
  restored: "Version restored. Publish to put it on the shop.",
};

function kb(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export type ThemeEditorParams = { file?: string; tab?: string; rev?: string; saved?: string; error?: string };

/** The Theme Editor screen. The route checks the caller is a Master before rendering it. */
export async function ThemeEditorView({ sp }: { sp: ThemeEditorParams }) {
  const tab = sp.tab === "images" ? "images" : "code";
  const [code, images, status, live] = await Promise.all([listFiles("code"), listFiles("images"), publishStatus(), liveBuildTime()]);
  const pending = live ? code.filter((f) => f.modified > live).length : 0;

  // The open file: the one asked for, else the stylesheet most edits start in.
  const current = code.find((f) => f.name === sp.file)?.name ?? (tab === "code" ? (code.find((f) => f.name === "br3thr.css") ?? code[0])?.name : undefined);
  let doc: { content: string; modified: number } | null = null;
  let revisionView: string | null = null;
  let loadError: string | null = null;
  if (tab === "code" && current) {
    try {
      doc = await readCode(current);
      if (sp.rev) revisionView = (await readRevision("code", current, sp.rev)).toString("utf8");
    } catch (e) {
      loadError = e instanceof ThemeError ? e.message : "Could not open that file.";
    }
  }
  const revisions = tab === "code" && current ? await listRevisions("code", current) : [];
  const back = tab === "images" ? `${PAGE}?tab=images` : current ? `${PAGE}?file=${encodeURIComponent(current)}` : PAGE;
  const tabCls = (on: boolean) =>
    `rounded-[var(--admin-radius-sm)] px-4 py-2 text-sm font-medium transition ${on ? "bg-[var(--admin-inset)] text-slate-900 ring-1 ring-[var(--admin-line-strong)]" : "text-slate-500 hover:text-slate-800"}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Theme Editor"
        subtitle="Edit the storefront's design files and images, then publish them to the shop. No SSH or FTP needed."
      />

      {sp.error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{sp.error}</p>
      ) : null}
      {sp.saved && NOTES[sp.saved] ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{NOTES[sp.saved]}</p>
      ) : null}

      <PublishPanel initial={status} pendingCount={pending} publish={publishTheme} back={back} />

      <div className="flex gap-2">
        <Link href={PAGE} className={tabCls(tab === "code")}>
          Design files
        </Link>
        <Link href={`${PAGE}?tab=images`} className={tabCls(tab === "images")}>
          Images
        </Link>
      </div>

      {tab === "code" ? (
        <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_240px]">
          {/* File list */}
          <aside className="rounded-[var(--admin-radius)] border border-[var(--admin-line)] bg-[var(--admin-surface)] p-3">
            <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Files</p>
            <ul className="space-y-0.5">
              {code.map((f) => {
                const on = f.name === current;
                const unpublished = live != null && f.modified > live;
                return (
                  <li key={f.name}>
                    <Link
                      href={`${PAGE}?file=${encodeURIComponent(f.name)}`}
                      className={`flex items-center gap-2 rounded-[var(--admin-radius-sm)] px-2.5 py-1.5 font-mono text-[12.5px] transition ${on ? "bg-[var(--admin-inset)] text-[var(--admin-accent)] ring-1 ring-[var(--admin-line-strong)]" : "text-slate-600 hover:bg-[var(--admin-inset)] hover:text-slate-900"}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      {unpublished ? <span title="Saved, not published yet" className="h-2 w-2 shrink-0 rounded-full bg-amber-500" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <form action={createThemeFile} className="mt-4 border-t border-[var(--admin-line)] pt-3">
              <label htmlFor="new-file" className="mb-1.5 block px-1 text-xs font-medium text-slate-600">
                New file
              </label>
              <div className="flex gap-1.5">
                <input id="new-file" name="name" placeholder="GfBanner.tsx" required className={`${inputCls} !py-1.5 font-mono !text-[12.5px]`} />
                <button type="submit" className={`${btnGhost} !px-3 !py-1.5`}>
                  Add
                </button>
              </div>
              <p className="mt-1.5 px-1 text-[11px] text-slate-500">{CODE_EXT.join(" ")}</p>
            </form>
          </aside>

          {/* Editor */}
          <section className="flex min-h-[620px] flex-col overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-line)] bg-[var(--admin-surface)]">
            {loadError ? (
              <p className="p-6 text-sm text-red-600">{loadError}</p>
            ) : current && doc ? (
              revisionView != null ? (
                <CodeEditor key={`${current}@${sp.rev}`} name={current} initial={revisionView} modified={doc.modified} readOnly />
              ) : (
                <CodeEditor key={`${current}@${doc.modified}`} name={current} initial={doc.content} modified={doc.modified} />
              )
            ) : (
              <p className="p-6 text-sm text-slate-500">No theme files found.</p>
            )}
          </section>

          {/* History */}
          <aside className="space-y-4">
            <div className="rounded-[var(--admin-radius)] border border-[var(--admin-line)] bg-[var(--admin-surface)] p-3">
              <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">History</p>
              {sp.rev ? (
                <div className="mb-3 space-y-2 rounded-[var(--admin-radius-sm)] bg-[var(--admin-inset)] p-2.5">
                  <p className="text-xs text-slate-600">Viewing an older version.</p>
                  <form action={restoreThemeRevision}>
                    <input type="hidden" name="root" value="code" />
                    <input type="hidden" name="name" value={current} />
                    <input type="hidden" name="id" value={sp.rev} />
                    <button type="submit" className={`${btnPrimary} w-full !py-2 !text-xs`}>
                      Restore this version
                    </button>
                  </form>
                  <Link href={`${PAGE}?file=${encodeURIComponent(current ?? "")}`} className={`${btnGhost} w-full !py-2 !text-xs`}>
                    Back to current
                  </Link>
                </div>
              ) : null}
              {revisions.length === 0 ? (
                <p className="px-1 text-xs text-slate-500">No earlier versions yet. Each save keeps the previous one here.</p>
              ) : (
                <ul className="max-h-[480px] space-y-0.5 overflow-auto">
                  {revisions.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`${PAGE}?file=${encodeURIComponent(current ?? "")}&rev=${encodeURIComponent(r.id)}`}
                        className={`block rounded-[var(--admin-radius-sm)] px-2 py-1.5 text-xs transition ${sp.rev === r.id ? "bg-[var(--admin-inset)] text-[var(--admin-accent)]" : "text-slate-600 hover:bg-[var(--admin-inset)]"}`}
                      >
                        <span className="block font-medium">{new Date(r.at).toLocaleString()}</span>
                        <span className="block truncate text-slate-500">{r.by}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {current ? (
              <form action={deleteThemeFile} className="px-1">
                <input type="hidden" name="root" value="code" />
                <input type="hidden" name="name" value={current} />
                <ConfirmSubmit message={`Delete ${current}? Pages that use it will fail to publish until it is restored.`} className="text-xs text-red-600 hover:underline">
                  Delete this file
                </ConfirmSubmit>
              </form>
            ) : null}
          </aside>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--admin-radius)] border border-[var(--admin-line)] bg-[var(--admin-surface)] p-4">
            <p className="max-w-2xl text-sm text-slate-600">
              Images used by the storefront design (logo, hero and banner photos, favicons). Uploading or replacing one updates the shop straight away, no publish needed. Use <span className="font-mono text-slate-800">/br3thr/name.jpg</span> to reference one in a design file.
            </p>
            <ImageUpload label="Upload images" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {images.map((f) => (
              <div key={f.name} className="overflow-hidden rounded-[var(--admin-radius)] border border-[var(--admin-line)] bg-[var(--admin-surface)]">
                <div className="flex aspect-[4/3] items-center justify-center bg-[var(--admin-inset)] bg-[repeating-conic-gradient(rgba(127,127,127,0.12)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/br3thr/${f.name}?v=${Math.round(f.modified)}`} alt={f.name} className="max-h-full max-w-full object-contain" loading="lazy" />
                </div>
                <div className="space-y-2 p-3">
                  <p className="truncate font-mono text-[12px] text-slate-800" title={f.name}>
                    {f.name}
                  </p>
                  <p className="text-[11px] text-slate-500">{kb(f.size)}</p>
                  <div className="flex items-center justify-between gap-2">
                    <ImageUpload replace={f.name} label="Replace" />
                    <form action={deleteThemeFile}>
                      <input type="hidden" name="root" value="images" />
                      <input type="hidden" name="name" value={f.name} />
                      <ConfirmSubmit message={`Delete ${f.name}? Anything using it will show a broken image.`} className="text-xs text-red-600 hover:underline">
                        Delete
                      </ConfirmSubmit>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
