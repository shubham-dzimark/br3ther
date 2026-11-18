import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { formatBytes } from "@/lib/media";
import { Card } from "@/components/admin/ui";
import { Dropzone } from "@/components/admin/Dropzone";
import { IconTrash } from "@/components/admin/Icons";
import { removeMedia, updateMediaAlt, uploadToLibrary } from "./actions";
import { getTimeZone, ymd } from "@/lib/timezone";

export const metadata: Metadata = { title: "Media" };
export const dynamic = "force-dynamic";

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ uploaded?: string; rejected?: string; deleted?: string; saved?: string }>;
}) {
  const tz = await getTimeZone();
  await requireCapability("content");
  const sp = await searchParams;

  const [assets, totals] = await Promise.all([
    prisma.mediaAsset.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.mediaAsset.aggregate({ _sum: { sizeBytes: true }, _count: { _all: true } }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Media</h1>
        <p className="mt-1 text-sm text-slate-500">
          {totals._count._all} file{totals._count._all === 1 ? "" : "s"} ·{" "}
          {formatBytes(totals._sum.sizeBytes ?? 0)} total. Anything here can be
          picked from any image field in the admin.
        </p>
      </div>

      {sp.uploaded ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Uploaded {sp.uploaded} file{sp.uploaded === "1" ? "" : "s"}.
        </p>
      ) : null}
      {sp.rejected ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {sp.rejected} file{sp.rejected === "1" ? " was" : "s were"} rejected —
          images up to 3.1 MB, video up to 5.1 MB.
        </p>
      ) : null}
      {sp.deleted ? (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          File deleted. Anywhere still pointing at it will show a broken image.
        </p>
      ) : null}

      <Card className="p-6">
        <Dropzone
            kind="library"
            label="Upload to the library"
            accept="image/*,video/mp4,video/quicktime,video/x-msvideo,video/x-ms-wmv"
            hint={"Images up to 3.1 MB · video up to 5.1 MB\nSelect several at once"}
            multiple
          />
      </Card>

      {assets.length === 0 ? (
        <Card className="p-16 text-center">
          <p className="text-sm text-slate-500">Nothing uploaded yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets.map((a) => (
            <Card key={a.id} className="overflow-hidden">
              <div className="aspect-square bg-slate-100">
                {a.mimeType.startsWith("video/") ? (
                  <video src={a.url} controls className="h-full w-full bg-black object-cover" />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={a.url}
                    alt={a.alt ?? a.filename}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
              </div>

              <div className="space-y-2 p-3">
                <p className="truncate text-xs font-medium text-slate-700" title={a.filename}>
                  {a.filename}
                </p>
                <p className="text-[11px] text-slate-400">
                  {formatBytes(a.sizeBytes)} · {ymd(a.createdAt, tz)}
                </p>

                <form action={updateMediaAlt} className="flex gap-1.5">
                  <input type="hidden" name="id" value={a.id} />
                  <input
                    name="alt"
                    defaultValue={a.alt ?? ""}
                    placeholder="Alt text"
                    aria-label={`Alt text for ${a.filename}`}
                    className="min-w-0 flex-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[var(--admin-accent)]"
                  />
                  <button
                    type="submit"
                    className="rounded-full border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Save
                  </button>
                </form>

                <div className="flex items-center justify-between gap-2">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-[var(--admin-accent)] hover:underline"
                  >
                    Open
                  </a>
                  <form action={removeMedia}>
                    <input type="hidden" name="id" value={a.id} />
                    <button
                      type="submit"
                      aria-label={`Delete ${a.filename}`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
