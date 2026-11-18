import { prisma } from "@/lib/prisma";
import { Card, btnPrimary } from "@/components/admin/ui";
import { Field, fieldInput, fieldTextarea } from "@/components/admin/Field";
import { IconTrash } from "@/components/admin/Icons";
import { TH, Empty } from "@/components/admin/PageCard";
import Link from "next/link";
import { createDeal, updateDeal, deleteDeal, toggleDeal } from "@/app/admin/(protected)/promotions/actions";
import type { DealType } from "@/generated/prisma";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { getTimeZone, ymd } from "@/lib/timezone";
import { ProductPicker } from "@/components/admin/ProductPicker";

/** Shared screen for flash sales and clearance deals - same shape, different type. */
export async function DealsScreen({
  type,
  slug,
  title,
  blurb,
  saved,
  editId,
}: {
  type: DealType;
  slug: string;
  title: string;
  blurb: string;
  saved?: string;
  /** When set, the side panel edits this deal instead of creating one. */
  editId?: string;
}) {
  const tz = await getTimeZone();
  const [deals, products] = await Promise.all([
    prisma.deal.findMany({
      where: { type },
      orderBy: { createdAt: "desc" },
      include: { products: { include: { product: { select: { name: true } } } } },
    }),
    prisma.product.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 200,
    }),
  ]);

  const now = new Date();
  const editing = editId ? (deals.find((d) => d.id === editId) ?? null) : null;
  const selected = new Set(editing?.products.map((p) => p.productId) ?? []);
  const asDateValue = (d: Date | null) => (d ? ymd(d, tz) : "");

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
              <p className="mt-1 text-sm text-slate-500">{blurb}</p>
            </div>
            {saved ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                Saved
              </span>
            ) : null}
          </div>
          <div className="h-5" />

          {deals.length === 0 ? (
            <Empty>Nothing set up yet.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full ">
                <thead className="bg-slate-50/80">
                  <tr>
                    <TH>Deal</TH>
                    <TH align="right">Discount</TH>
                    <TH>Window</TH>
                    <TH>Status</TH>
                    <TH align="right">Action</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deals.map((d) => {
                    const expired = d.endsAt ? d.endsAt < now : false;
                    const live = d.isActive && !expired;
                    return (
                      <tr key={d.id} className={editing?.id === d.id ? "bg-[#E2EEEA]/40" : "hover:bg-slate-50/60"}>
                        <td className="px-3 lg:px-5 py-4">
                          <span className="block text-sm font-medium text-slate-900">
                            {d.title}
                          </span>
                          <span className="block text-xs text-slate-400">
                            {d.products.length} product
                            {d.products.length === 1 ? "" : "s"}
                            {d.products.length
                              ? ` · ${d.products.map((p) => p.product.name).slice(0, 3).join(", ")}`
                              : ""}
                          </span>
                        </td>
                        <td className="px-3 lg:px-5 py-4 text-right text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                          {d.percentOff}%
                        </td>
                        <td className="px-3 lg:px-5 py-4 text-xs text-slate-500">
                          {d.startsAt ? ymd(d.startsAt, tz) : "—"}
                          {" → "}
                          {d.endsAt ? ymd(d.endsAt, tz) : "—"}
                        </td>
                        <td className="px-3 lg:px-5 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                              live
                                ? "bg-emerald-50 text-emerald-700"
                                : expired
                                  ? "bg-slate-100 text-slate-500"
                                  : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {live ? "Active" : expired ? "Ended" : "Paused"}
                          </span>
                        </td>
                        <td className="px-3 lg:px-5 py-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/admin/promotions/${slug}?edit=${d.id}`}
                              className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                            >
                              Edit
                            </Link>
                            <form action={toggleDeal}>
                              <input type="hidden" name="id" value={d.id} />
                              <input type="hidden" name="back" value={slug} />
                              <input type="hidden" name="active" value={d.isActive ? "0" : "1"} />
                              <button
                                type="submit"
                                className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                              >
                                {d.isActive ? "Pause" : "Resume"}
                              </button>
                            </form>
                            <form action={deleteDeal}>
                              <input type="hidden" name="id" value={d.id} />
                              <input type="hidden" name="back" value={slug} />
                              <button
                                type="submit"
                                aria-label={`Delete ${d.title}`}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                              >
                                <IconTrash className="h-[17px] w-[17px]" />
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="h-fit p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {editing ? `Edit ${editing.title}` : `New ${title.toLowerCase()}`}
          </h2>
          {editing ? (
            <Link
              href={`/admin/promotions/${slug}`}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              Cancel
            </Link>
          ) : null}
        </div>

        {/* A distinct key forces the browser to rebuild the inputs when you
            switch between deals, instead of keeping the previous values. */}
        <form
          key={editing?.id ?? "new"}
          action={editing ? updateDeal : createDeal}
          className="space-y-7"
        >
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="back" value={slug} />
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

          <Field label="Title" htmlFor="title">
            <input id="title" name="title" required defaultValue={editing?.title ?? ""} className={fieldInput} />
          </Field>
          <Field label="Percent off" htmlFor="percentOff">
            <input id="percentOff" name="percentOff" type="number" min="0" max="100" defaultValue={editing ? String(editing.percentOff) : "10"} className={fieldInput} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts" htmlFor="startsAt">
              <input id="startsAt" name="startsAt" type="date" defaultValue={asDateValue(editing?.startsAt ?? null)} className={fieldInput} />
            </Field>
            <Field label="Ends" htmlFor="endsAt">
              <input id="endsAt" name="endsAt" type="date" defaultValue={asDateValue(editing?.endsAt ?? null)} className={fieldInput} />
            </Field>
          </div>
          <MediaPicker name="bannerImage" label="Banner image" defaultValue={editing?.bannerImage ?? ""} />
          <Field label="Description" htmlFor="description">
            <textarea id="description" name="description" rows={3} defaultValue={editing?.description ?? ""} className={fieldTextarea} />
          </Field>

          <div>
            <label htmlFor="productIds" className="mb-1.5 block text-sm font-medium text-slate-700">
              Products in this deal
            </label>
            {products.length === 0 ? (
              <p className="text-sm text-slate-400">
                Add products first, then come back here.
              </p>
            ) : (
              /*
               * Type to search rather than a native multi-select. The old
               * control needed cmd-click and showed a fixed window of names,
               * which stops being usable somewhere around the second screenful
               * of products.
               */
              <ProductPicker
                name="productIds"
                options={products}
                defaultValue={[...selected]}
                placeholder="Type a product name to add it…"
              />
            )}
          </div>

          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input type="checkbox" name="isActive" defaultChecked={editing ? editing.isActive : true} className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]" />
            Active immediately
          </label>

          <button type="submit" className={btnPrimary}>
            Create
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-400">
          Deals are stored and manageable now. They start affecting displayed prices
          once the storefront is built.
        </p>
      </Card>
    </div>
  );
}
