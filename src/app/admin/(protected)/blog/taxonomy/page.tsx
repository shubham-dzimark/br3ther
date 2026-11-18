import { SITE_HOST } from "@/lib/site";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SeoFields } from "@/components/admin/SeoFields";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { requireCapability } from "@/lib/permissions";
import { SectionCard, Field, fieldInput, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { IconTrash } from "@/components/admin/Icons";
import { deleteCategory, deleteTag, saveCategory } from "../actions";

export const metadata: Metadata = { title: "Blog categories & tags" };
export const dynamic = "force-dynamic";

export default async function TaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; edit?: string }>;
}) {
  await requireCapability("content");
  const { saved, error, edit } = await searchParams;

  const [categories, tags] = await Promise.all([
    prisma.blogCategory.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { posts: true } } },
    }),
    prisma.blogTag.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { posts: true } } },
    }),
  ]);

  const editing = edit ? categories.find((c) => c.id === edit) : undefined;
  const storeName = (await getSettings())[SETTING_KEYS.storeName] || "Br3thr";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/blog"
          aria-label="Back to blog"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Categories &amp; tags
        </h1>
      </div>

      {saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error === "slug"
            ? "Another category already uses that URL slug."
            : "A name is required."}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          <form action={saveCategory}>
            <SectionCard title={editing ? "Edit category" : "Add a category"}>
              {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
              <div className="space-y-7">
                <Field label="Name" htmlFor="name">
                  <input
                    id="name"
                    name="name"
                    required
                    defaultValue={editing?.name}
                    className={fieldInput}
                  />
                </Field>
                <Field label="URL slug (optional)" htmlFor="slug">
                  <input
                    id="slug"
                    name="slug"
                    defaultValue={editing?.slug}
                    placeholder="Made from the name"
                    className={fieldInput}
                  />
                </Field>
                <Field label="Description (optional)" htmlFor="description">
                  <textarea
                    id="description"
                    name="description"
                    rows={2}
                    defaultValue={editing?.description ?? ""}
                    className={fieldTextarea}
                  />
                </Field>
              </div>

              <div className="mt-7 rounded-2xl border border-slate-200 p-5">
                <p className="mb-4 text-sm font-semibold text-slate-900">
                  Search engine listing
                </p>
                <SeoFields
                  defaultTitle={editing?.seoTitle ?? ""}
                  defaultDescription={editing?.seoDescription ?? ""}
                  context={{
                    title: editing?.name ?? "",
                    sitename: storeName,
                    sep: "|",
                    excerpt: editing?.description ?? "",
                  }}
                  subject={`Blog category: ${editing?.name ?? "new category"}. ${editing?.description ?? ""}`}
                  urlPrefix={`${SITE_HOST}/blog/category/`}
                />
              </div>

              <div className="mt-7 flex items-center gap-3">
                <button type="submit" className={btnPrimary}>
                  {editing ? "Update category" : "Add category"}
                </button>
                {editing ? (
                  <Link
                    href="/admin/blog/taxonomy"
                    className="text-sm font-medium text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </Link>
                ) : null}
              </div>
            </SectionCard>
          </form>

          <SectionCard title={`Categories (${categories.length})`}>
            {categories.length === 0 ? (
              <p className="text-sm text-slate-500">None yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {categories.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        /blog/category/{c.slug} &middot; {c._count.posts} post
                        {c._count.posts === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Link
                      href={`/admin/blog/taxonomy?edit=${c.id}`}
                      className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                    >
                      Edit
                    </Link>
                    <form action={deleteCategory}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        aria-label={`Delete ${c.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <IconTrash className="h-[17px] w-[17px]" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
              Deleting a category leaves its posts alone &mdash; only the
              grouping goes.
            </p>
          </SectionCard>
        </div>

        <SectionCard title={`Tags (${tags.length})`}>
          {tags.length === 0 ? (
            <p className="text-sm text-slate-500">
              Tags appear here once you use them on a post. Type them into the
              Tags box when writing; new ones are created automatically.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tags.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">
                      /blog/tag/{t.slug} &middot; {t._count.posts} post
                      {t._count.posts === 1 ? "" : "s"}
                    </p>
                  </div>
                  <form action={deleteTag}>
                    <input type="hidden" name="id" value={t.id} />
                    <button
                      type="submit"
                      aria-label={`Delete ${t.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <IconTrash className="h-[17px] w-[17px]" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
