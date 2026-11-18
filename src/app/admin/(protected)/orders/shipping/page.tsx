import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { SectionCard, Field, fieldInput, fieldSelect } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { CSV_HEADERS } from "@/lib/tracking-csv";
import { importTracking } from "./actions";
import { getTimeZone, ymd } from "@/lib/timezone";

export const metadata: Metadata = { title: "Shipping labels & tracking" };
export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "PROCESSING", label: "Processing" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Completed" },
] as const;

const IMPORT_ERRORS: Record<string, string> = {
  nofile: "Choose a CSV file first.",
  empty: "That file has no rows under its header.",
  columns:
    "The file needs at least an order number column and a tracking number column.",
};

export default async function ShippingLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{
    imported?: string;
    skipped?: string;
    missing?: string;
    existing?: string;
    error?: string;
  }>;
}) {
  const tz = await getTimeZone();
  await requireCapability("orders");
  const [sp, untracked] = await Promise.all([
    searchParams,
    prisma.order.count({
      where: {
        OR: [{ trackingCode: null }, { trackingCode: "" }],
        status: { notIn: ["CANCELLED", "REFUNDED"] },
      },
    }),
  ]);

  const today = ymd(new Date(), tz);
  const imported = Number(sp.imported ?? "");
  const showResult = Number.isFinite(imported) && sp.imported !== undefined;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Shipping labels &amp; tracking
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Export the orders waiting to go out, hand the file to your courier,
          then import it back with their tracking numbers filled in.
        </p>
      </div>

      {sp.error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {IMPORT_ERRORS[sp.error] ?? "That import could not be read."}
        </p>
      ) : null}

      {showResult ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-medium">
            {imported} order{imported === 1 ? "" : "s"} updated.
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            {sp.missing && Number(sp.missing) > 0
              ? `${sp.missing} order number${Number(sp.missing) === 1 ? "" : "s"} not found. `
              : ""}
            {sp.existing && Number(sp.existing) > 0
              ? `${sp.existing} already had tracking and were left alone. `
              : ""}
            {sp.skipped && Number(sp.skipped) > 0
              ? `${sp.skipped} row${Number(sp.skipped) === 1 ? "" : "s"} were missing an order number or tracking number.`
              : ""}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        {/* ---------- Export ---------- */}
        <SectionCard title="Export shipping labels">
          <p className="mb-7 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Downloads the shipping address for each order, plus empty carrier and
            tracking columns. Fill those in and import the same file below.
            <span className="mt-1 block font-medium text-slate-700">
              {untracked} order{untracked === 1 ? "" : "s"} currently have no
              tracking number.
            </span>
          </p>

          <form action="/api/admin/shipping-labels" className="space-y-7">
            <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
              <Field label="Order status" htmlFor="status">
                <select id="status" name="status" defaultValue="PROCESSING" className={fieldSelect}>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input
                type="checkbox"
                name="untracked"
                value="1"
                defaultChecked
                className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
              />
              <span className="text-sm text-slate-700">
                Only orders with no tracking number yet
                <span className="mt-0.5 block text-xs text-slate-500">
                  Stops you printing a second label for a parcel that already went out.
                </span>
              </span>
            </label>

            <button type="submit" className={btnPrimary}>
              Export CSV
            </button>
          </form>
        </SectionCard>

        {/* ---------- Import ---------- */}
        <SectionCard title="Import tracking numbers">
          <form action={importTracking} className="space-y-7">
            <div>
              <label
                htmlFor="file"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                CSV file
              </label>
              <input
                id="file"
                name="file"
                type="file"
                accept=".csv,text/csv"
                required
                className="block w-full rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-[var(--admin-btn)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--admin-btn-ink)]"
              />
              <p className="mt-2 text-xs text-slate-500">
                Needs an <code className="rounded bg-slate-100 px-1">order_number</code>{" "}
                column and a{" "}
                <code className="rounded bg-slate-100 px-1">tracking_number</code>{" "}
                column. <code className="rounded bg-slate-100 px-1">carrier</code> and{" "}
                <code className="rounded bg-slate-100 px-1">shipped_date</code> are
                optional. Column order does not matter.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-x-5 gap-y-7 xl:grid-cols-2">
              <Field label="How dates are written in the file" htmlFor="dateOrder">
                <select id="dateOrder" name="dateOrder" defaultValue="dmy" className={fieldSelect}>
                  <option value="dmy">dd/mm/YYYY</option>
                  <option value="mdy">mm/dd/YYYY</option>
                </select>
              </Field>
              <Field label="Shipped date for rows without one" htmlFor="defaultShippedAt">
                <input
                  id="defaultShippedAt"
                  name="defaultShippedAt"
                  type="date"
                  defaultValue={today}
                  className={fieldInput}
                />
              </Field>
            </div>
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
              The format above only applies to a{" "}
              <code className="rounded bg-white px-1">shipped_date</code> column in
              the file. When a row has no date, the date picked here is used
              instead.
            </p>

            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input
                type="checkbox"
                name="replaceExisting"
                className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
              />
              <span className="text-sm text-slate-700">
                Replace tracking that is already there
                <span className="mt-0.5 block text-xs text-slate-500">
                  Off by default: orders that already have a number are left alone
                  and counted in the summary.
                </span>
              </span>
            </label>

            <button type="submit" className={btnPrimary}>
              Import tracking numbers
            </button>
          </form>

          <p className="mt-6 border-t border-slate-100 pt-5 text-xs text-slate-500">
            Expected columns: {CSV_HEADERS.join(", ")}
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
