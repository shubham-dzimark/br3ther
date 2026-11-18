import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { requireCapability } from "@/lib/permissions";
import { Card, btnPrimary, btnDanger, Badge } from "@/components/admin/ui";
import { SectionCard, Field, fieldInput, fieldTextarea } from "@/components/admin/Field";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { saveBanner, deleteBanner } from "./actions";
import { ConfirmSubmit } from "@/components/admin/ConfirmSubmit";

export const metadata: Metadata = { title: "Hero banners" };
export const dynamic = "force-dynamic";

export default async function HeroBannersPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; saved?: string; deleted?: string; error?: string }>;
}) {
  await requireCapability("content");
  const sp = await searchParams;

  const [banners, editing, s] = await Promise.all([
    prisma.heroBanner.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    sp.id ? prisma.heroBanner.findUnique({ where: { id: sp.id } }) : Promise.resolve(null),
    getSettings(),
  ]);

  const active = (s[SETTING_KEYS.heroMode] || "panels") === "banner";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Hero banners
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Full-width slides for the home page. A slide with no heading,
          subheading or button shows as the bare image &mdash; nothing is laid
          over the picture unless you give it something to say.
        </p>
      </div>

      {!active ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          These are not on the site right now. The home page is set to a
          different hero &mdash; switch it to &ldquo;Banner slider&rdquo; in{" "}
          <Link href="/admin/content/home" className="font-medium underline">
            Home page control
          </Link>
          .
        </p>
      ) : null}

      {sp.saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </p>
      ) : null}
      {sp.deleted ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Slide deleted.
        </p>
      ) : null}
      {sp.error === "image" ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          A slide needs an image.
        </p>
      ) : null}

      <SectionCard title={editing ? "Edit slide" : "New slide"}>
        <form key={editing?.id ?? "new"} action={saveBanner} className="space-y-6">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <MediaPicker
              name="imageUrl"
              label="Image (required)"
              defaultValue={editing?.imageUrl ?? ""}
            />
            <MediaPicker
              name="mobileImageUrl"
              label="Phone crop (optional)"
              defaultValue={editing?.mobileImageUrl ?? ""}
            />
          </div>

          <Field label="Image description, for screen readers" htmlFor="alt">
            <input
              id="alt"
              name="alt"
              defaultValue={editing?.alt ?? ""}
              placeholder="Two models wearing the winter range"
              className={fieldInput}
            />
          </Field>

          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            <p className="mb-4 text-xs leading-relaxed text-slate-600">
              Everything below is optional. Leave it all blank and the slide is
              just the image.
            </p>

            <div className="space-y-5">
              <Field label="Heading" htmlFor="heading">
                <input
                  id="heading"
                  name="heading"
                  defaultValue={editing?.heading ?? ""}
                  className={fieldInput}
                />
              </Field>

              <Field label="Supporting line" htmlFor="subheading">
                <textarea
                  id="subheading"
                  name="subheading"
                  rows={2}
                  defaultValue={editing?.subheading ?? ""}
                  className={fieldTextarea}
                />
              </Field>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <Field label="Button text" htmlFor="ctaLabel">
                  <input
                    id="ctaLabel"
                    name="ctaLabel"
                    defaultValue={editing?.ctaLabel ?? ""}
                    placeholder="Shop now"
                    className={fieldInput}
                  />
                </Field>
                <Field label="Button link" htmlFor="ctaHref">
                  <input
                    id="ctaHref"
                    name="ctaHref"
                    defaultValue={editing?.ctaHref ?? ""}
                    placeholder="/shop"
                    className={fieldInput}
                  />
                </Field>
                <Field label="Text sits" htmlFor="textPosition">
                  <select
                    id="textPosition"
                    name="textPosition"
                    defaultValue={editing?.textPosition ?? "left"}
                    className={fieldInput}
                  >
                    <option value="left">Left</option>
                    <option value="center">Centre</option>
                    <option value="right">Right</option>
                  </select>
                </Field>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Order (lower shows first)" htmlFor="sortOrder">
              <input
                id="sortOrder"
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={String(editing?.sortOrder ?? banners.length)}
                className={fieldInput}
              />
            </Field>
            <label className="flex items-center gap-3 self-end pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={editing ? editing.isActive : true}
                className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
              />
              Show this slide
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={btnPrimary}>
              {editing ? "Save slide" : "Add slide"}
            </button>
            {editing ? (
              <Link
                href="/admin/content/hero-banners"
                className="text-sm font-medium text-slate-500 hover:text-slate-800"
              >
                Cancel
              </Link>
            ) : null}
          </div>
        </form>

        {editing ? (
          <form action={deleteBanner} className="mt-5 border-t border-slate-100 pt-5">
            <input type="hidden" name="id" value={editing.id} />
            <button type="submit" className={btnDanger}>
              Delete this slide
            </button>
          </form>
        ) : null}
      </SectionCard>

      <Card className="overflow-hidden">
        <div className="px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Slides ({banners.filter((b) => b.isActive).length} showing of{" "}
            {banners.length})
          </h2>
        </div>
        {banners.length === 0 ? (
          <p className="px-6 pb-10 text-center text-sm text-slate-400">
            No slides yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {banners.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-4 px-6 py-3.5 transition hover:bg-slate-50/70"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.imageUrl}
                  alt=""
                  className="h-12 w-20 shrink-0 rounded-lg border border-slate-100 object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {b.heading || <span className="text-slate-400">Image only</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-400">
                    {b.ctaLabel ? `${b.ctaLabel} \u2192 ${b.ctaHref || "—"} · ` : ""}
                    text {b.textPosition} · order {b.sortOrder}
                  </span>
                </span>

                {b.isActive ? null : <Badge tone="slate">Hidden</Badge>}

                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/admin/content/hero-banners?id=${b.id}`}
                    className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                  >
                    Edit
                  </Link>
                  {/* Its own form: a delete cannot be nested inside the edit
                      link, and HTML forbids nesting forms. */}
                  <form action={deleteBanner}>
                    <input type="hidden" name="id" value={b.id} />
                    <ConfirmSubmit
                      message={`Delete this slide?\n\nIt is removed from the home page immediately and cannot be undone.`}
                      className="rounded-full border border-red-200 px-3.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                    >
                      Delete
                    </ConfirmSubmit>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
