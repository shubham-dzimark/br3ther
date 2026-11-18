import { SITE_HOST } from "@/lib/site";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { Card, btnPrimary } from "@/components/admin/ui";
import { Field, fieldInput, fieldTextarea } from "@/components/admin/Field";
import { IconTrash } from "@/components/admin/Icons";
import { createPage, deletePage, ensureSystemPages, savePage } from "./actions";
import { requireCapability } from "@/lib/permissions";
import { SeoFields } from "@/components/admin/SeoFields";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { RichTextEditor } from "@/components/admin/RichTextEditor";

export const metadata: Metadata = { title: "Pages & policies" };
export const dynamic = "force-dynamic";

export default async function ContentPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; saved?: string }>;
}) {
  await requireCapability("content");
  await ensureSystemPages();

  const { page: pageId, saved } = await searchParams;
  const pages = await prisma.contentPage.findMany({
    orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { title: "asc" }],
  });

  const storeName =
    (await getSettings())[SETTING_KEYS.storeName] || "Br3thr";
  const selected =
    (pageId ? pages.find((p) => p.id === pageId) : undefined) ?? pages[0];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
      <Card className="h-fit p-4 lg:col-span-1">
        <h2 className="mb-3 px-2 text-sm font-semibold text-slate-900">Pages</h2>
        <ul className="mb-4 space-y-0.5">
          {pages.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/content/pages?page=${p.id}`}
                className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition ${
                  selected?.id === p.id
                    ? "bg-[#E2EEEA] font-medium text-[var(--admin-accent)]"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">{p.title}</span>
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    p.isPublished ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                  title={p.isPublished ? "Published" : "Draft"}
                />
              </Link>
            </li>
          ))}
        </ul>

        <form action={createPage} className="border-t border-slate-100 pt-4">
          <input
            name="title"
            required
            placeholder="New page title"
            className="mb-2 w-full rounded-full border border-slate-200 px-4 py-2 text-sm outline-none focus:border-[var(--admin-accent)]"
          />
          <button
            type="submit"
            className="w-full rounded-full border border-[var(--admin-accent)] px-4 py-2 text-sm font-medium text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
          >
            Add page
          </button>
        </form>
      </Card>

      <div className="lg:col-span-3">
        {!selected ? (
          <Card className="p-12 text-center">
            <p className="text-sm text-slate-500">No pages yet.</p>
          </Card>
        ) : (
          /*
           * Keyed on the page id so switching pages remounts the form.
           *
           * Without it React reused the same inputs across the navigation:
           * defaultValue is only read on mount and the editor seeds its state
           * once, so the heading changed to the new page while the title box
           * and the editor still held the previous one. A reload "fixed" it
           * only because that forced a fresh mount.
           */
          <form key={selected.id} action={savePage} className="space-y-5">
            <input type="hidden" name="id" value={selected.id} />

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {selected.title}
              </h1>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                /{selected.slug}
              </span>
              {saved ? (
                <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                  Saved
                </span>
              ) : null}
            </div>

            <Card className="p-6">
              <div className="space-y-7">
                <Field label="Title" htmlFor="title">
                  <input id="title" name="title" defaultValue={selected.title} className={fieldInput} />
                </Field>

                <Field label="Content" htmlFor="body">
                  {/* Same editor as products and posts - a policy page needs
                      headings, lists and tables as much as anything else. */}
                  <RichTextEditor
                    name="body"
                    initialHtml={selected.body}
                    placeholder="Write the page content here."
                    minHeight={420}
                  />
                </Field>

                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="isPublished"
                    defaultChecked={selected.isPublished}
                    className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
                  />
                  Published
                </label>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="mb-6 text-lg font-semibold text-slate-900">
                Search engine listing
              </h2>
              <SeoFields
                defaultTitle={selected.seoTitle ?? ""}
                defaultDescription={selected.seoDescription ?? ""}
                context={{
                  title: selected.title,
                  sitename: storeName,
                  sep: "|",
                }}
                subject={`Page: ${selected.title}.`}
                urlPrefix={`${SITE_HOST}/pages/`}
              />
            </Card>

            <div className="flex items-center justify-between gap-3 pb-2">
              {selected.isSystem ? (
                <p className="text-xs text-slate-400">
                  This is a standard policy page and can&rsquo;t be deleted.
                </p>
              ) : (
                <button
                  type="submit"
                  formAction={deletePage}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  <IconTrash className="h-4 w-4" />
                  Delete page
                </button>
              )}
              <button type="submit" className={`${btnPrimary} px-8`}>
                Save page
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
