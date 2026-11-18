"use client";

import { SITE_HOST } from "@/lib/site";
import { useState } from "react";
import { Field, fieldInput, fieldTextarea, SectionCard } from "./Field";
import { MediaPicker } from "./MediaPicker";
import { slugify } from "@/lib/slug";
import { SeoFields } from "@/components/admin/SeoFields";
import { RichTextEditor } from "@/components/admin/RichTextEditor";

/*
 * The post form, shared by "write" and "edit" so the two can never drift.
 * A client component for two reasons only: the slug follows the title until
 * someone edits it by hand, and the status control swaps the date label
 * between "Published on" and "Publish on" so scheduling is discoverable.
 */

export type PostEditorValues = {
  id?: string;
  title?: string;
  slug?: string;
  excerpt?: string;
  body?: string;
  coverImage?: string;
  status?: "DRAFT" | "PUBLISHED";
  publishedAt?: string;
  seoTitle?: string;
  seoDescription?: string;
  commentsOpen?: boolean;
  categoryIds?: string[];
  tags?: string;
};

export function PostEditor({
  action,
  values = {},
  categories,
  submitLabel,
  /** For %%sitename%% in the SEO preview. */
  storeName = "",
}: {
  action: (fd: FormData) => void | Promise<void>;
  values?: PostEditorValues;
  categories: { id: string; name: string }[];
  submitLabel: string;
  storeName?: string;
}) {
  const [title, setTitle] = useState(values.title ?? "");
  const [slug, setSlug] = useState(values.slug ?? "");
  // An existing post already has a URL people may have linked to, so its slug
  // is only ever changed deliberately.
  const [slugLocked, setSlugLocked] = useState(Boolean(values.slug));
  const [status, setStatus] = useState(values.status ?? "DRAFT");

  return (
    <form action={action} className="space-y-5">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="space-y-5">
          <SectionCard title="Content">
            <div className="space-y-7">
              <Field label="Title" htmlFor="title">
                <input
                  id="title"
                  name="title"
                  required
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (!slugLocked) setSlug(slugify(e.target.value));
                  }}
                  className={fieldInput}
                />
              </Field>

              <Field label="URL slug" htmlFor="slug">
                <input
                  id="slug"
                  name="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugLocked(true);
                  }}
                  className={fieldInput}
                />
              </Field>
              <p className="-mt-4 px-1 text-xs text-slate-500">
                The post will live at <code className="rounded bg-slate-100 px-1">/blog/{slug || "…"}</code>.
                Changing it on a published post breaks existing links.
              </p>

              <Field label="Body" htmlFor="body">
                {/* Same editor as the product description: Visual and Code
                    tabs, the full toolbar, tables and media. */}
                <RichTextEditor
                  name="body"
                  initialHtml={values.body ?? ""}
                  placeholder="Write the post — headings, lists, tables and images are all fine"
                  minHeight={420}
                />
              </Field>

              <Field label="Excerpt" htmlFor="excerpt">
                <textarea
                  id="excerpt"
                  name="excerpt"
                  rows={3}
                  defaultValue={values.excerpt}
                  placeholder="Left blank, the opening of the post is used."
                  className={fieldTextarea}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Search engines">
            <SeoFields
              defaultTitle={values.seoTitle}
              defaultDescription={values.seoDescription}
              context={{
                title: title || values.title || "",
                sitename: storeName,
                sep: "|",
                excerpt: values.excerpt ?? "",
              }}
              subject={`Blog post: ${title || values.title || "new post"}. ${values.excerpt ?? ""}`}
              urlPrefix={`${SITE_HOST}/blog/`}
            />
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Publish">
            <div className="space-y-7">
              <Field label="Status" htmlFor="status">
                <select
                  id="status"
                  name="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "DRAFT" | "PUBLISHED")}
                  className={fieldInput}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                </select>
              </Field>

              <Field
                label={status === "PUBLISHED" ? "Publish date" : "Date (when published)"}
                htmlFor="publishedAt"
              >
                <input
                  id="publishedAt"
                  name="publishedAt"
                  type="datetime-local"
                  defaultValue={values.publishedAt}
                  className={fieldInput}
                />
              </Field>
              <p className="-mt-4 px-1 text-xs text-slate-500">
                A future date schedules the post: it stays off the site until
                then, with no job to run. Blank means now.
              </p>

              <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
                <input
                  type="checkbox"
                  name="commentsOpen"
                  defaultChecked={values.commentsOpen ?? true}
                  className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
                />
                <span className="text-sm text-slate-700">
                  Allow comments
                  <span className="mt-0.5 block text-xs text-slate-500">
                    New comments are held for approval before they appear.
                  </span>
                </span>
              </label>

              <button
                type="submit"
                className="w-full rounded-full bg-[var(--admin-btn)] px-6 py-3 text-sm font-semibold text-[var(--admin-btn-ink)] transition hover:bg-[var(--admin-btn)]"
              >
                {submitLabel}
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Cover image">
            <MediaPicker
              name="coverImage"
              label="Cover image"
              defaultValue={values.coverImage}
              hint="Shown on the index and at the top of the post. Landscape works best."
            />
          </SectionCard>

          <SectionCard title="Categories">
            {categories.length === 0 ? (
              <p className="text-sm text-slate-500">
                No categories yet — add them under Categories &amp; tags.
              </p>
            ) : (
              <div className="max-h-56 space-y-2.5 overflow-y-auto">
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="categoryIds"
                      value={c.id}
                      defaultChecked={values.categoryIds?.includes(c.id)}
                      className="h-4 w-4 accent-[var(--admin-accent)]"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Tags">
            <Field label="Tags, comma separated" htmlFor="tags">
              <input
                id="tags"
                name="tags"
                defaultValue={values.tags}
                placeholder="summer, styling tips"
                className={fieldInput}
              />
            </Field>
            <p className="mt-3 px-1 text-xs text-slate-500">
              Tags that don&rsquo;t exist yet are created on save.
            </p>
          </SectionCard>
        </div>
      </div>
    </form>
  );
}
