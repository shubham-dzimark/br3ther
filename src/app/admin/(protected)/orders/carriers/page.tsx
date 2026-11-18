import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { SectionCard, Field, fieldInput, fieldSelect } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { MediaPicker } from "@/components/admin/MediaPicker";
import { IconTrash } from "@/components/admin/Icons";
import { CARRIER_CATALOGUE, CATALOGUE_REGIONS } from "@/lib/carrier-catalogue";
import {
  addCatalogueCarrier,
  addCustomCarrier,
  deleteCarrier,
  toggleCarrier,
  updateCarrier,
} from "./actions";

export const metadata: Metadata = { title: "Shipping carriers" };
export const dynamic = "force-dynamic";

const PER_PAGE = 8;

const ERRORS: Record<string, string> = {
  unknown: "That carrier is not in the catalogue.",
  missing: "Give the carrier a name.",
  duplicate: "A carrier with that name already exists.",
  inuse: "That carrier is on existing orders — switch it off instead of removing it.",
};

/** Logo when one is uploaded, otherwise the coloured monogram tile. */
function CarrierMark({
  logoUrl,
  monogram,
  colour,
  size = "h-11 w-11",
}: {
  logoUrl?: string | null;
  monogram: string;
  colour: string;
  size?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 text-xs font-bold text-[var(--on-colour)]`}
      style={logoUrl ? { background: "#fff" } : { background: colour }}
    >
      {logoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
      ) : (
        monogram
      )}
    </span>
  );
}

export default async function CarriersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    region?: string;
    page?: string;
    edit?: string;
    error?: string;
    added?: string;
    removed?: string;
    saved?: string;
    count?: string;
  }>;
}) {
  await requireCapability("settings");
  const sp = await searchParams;
  const carriers = await prisma.shippingCarrier.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const have = new Set(carriers.map((c) => c.key));
  const q = (sp.q ?? "").trim().toLowerCase();
  const region = sp.region ?? "";

  // The catalogue minus what is already added, then filtered.
  const available = CARRIER_CATALOGUE.filter(
    (c) =>
      !have.has(c.key) &&
      (region === "" || c.region === region) &&
      (q === "" ||
        c.name.toLowerCase().includes(q) ||
        c.region.toLowerCase().includes(q)),
  );

  const pages = Math.max(1, Math.ceil(available.length / PER_PAGE));
  const page = Math.min(Math.max(1, Number(sp.page ?? "1") || 1), pages);
  const slice = available.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const editing = sp.edit ? carriers.find((c) => c.id === sp.edit) : null;
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (region) p.set("region", region);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Shipping carriers
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          The couriers you can attach tracking to. Switch one off to hide it from
          the tracking picker without touching orders that already use it.
        </p>
      </div>

      {sp.error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {ERRORS[sp.error] ?? "That didn't work."}
          {sp.error === "inuse" && sp.count ? ` (${sp.count} orders)` : ""}
        </p>
      ) : null}
      {sp.added ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {sp.added} added.
        </p>
      ) : null}
      {sp.removed ? (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {sp.removed} removed.
        </p>
      ) : null}
      {sp.saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </p>
      ) : null}

      {/* ---------- Editing one carrier ---------- */}
      {editing ? (
        <SectionCard title={`Edit ${editing.name}`}>
          <form action={updateCarrier} className="space-y-7">
            <input type="hidden" name="id" value={editing.id} />
            <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
              <Field label="Name" htmlFor="name">
                <input id="name" name="name" defaultValue={editing.name} className={fieldInput} />
              </Field>
              <Field label="Country / region" htmlFor="region">
                <input id="region" name="region" defaultValue={editing.region} className={fieldInput} />
              </Field>
              <MediaPicker
                name="logoUrl"
                label="Logo"
                defaultValue={editing.logoUrl ?? ""}
                hint="Upload the courier's logo — a square PNG or SVG works best. Leave blank to use the coloured initials instead."
              />
              <div className="space-y-7">
                <Field label="Initials (used when there is no logo)" htmlFor="monogram">
                  <input id="monogram" name="monogram" maxLength={3} defaultValue={editing.monogram} className={fieldInput} />
                </Field>
                <Field label="Tile colour" htmlFor="colour">
                  <input id="colour" name="colour" defaultValue={editing.colour} placeholder="#334155" className={fieldInput} />
                </Field>
              </div>
            </div>
            <Field label="Tracking URL" htmlFor="trackUrl">
              <input
                id="trackUrl"
                name="trackUrl"
                defaultValue={editing.trackUrl}
                placeholder="https://carrier.example/track?number={n}"
                className={fieldInput}
              />
            </Field>
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Put <code className="rounded bg-white px-1">{"{n}"}</code> where the
              tracking number goes. Leave the URL blank and the number shows as
              plain text with no link.
            </p>
            <div className="flex gap-3">
              <button type="submit" className={btnPrimary}>Save carrier</button>
              <Link
                href="/admin/orders/carriers"
                className="rounded-full border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {/* ---------- Enabled carriers ---------- */}
      <SectionCard title={`Your carriers (${carriers.length})`}>
        {carriers.length === 0 ? (
          <p className="text-sm text-slate-500">None yet — add some below.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {carriers.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-3 rounded-2xl border p-4 ${
                  c.isActive ? "border-slate-200" : "border-dashed border-slate-200 opacity-60"
                }`}
              >
                <CarrierMark logoUrl={c.logoUrl} monogram={c.monogram} colour={c.colour} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
                  <p className="truncate text-xs text-slate-400">{c.region}</p>
                </div>

                <form action={toggleCarrier}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="active" value={c.isActive ? "0" : "1"} />
                  <button
                    type="submit"
                    role="switch"
                    aria-checked={c.isActive}
                    aria-label={`${c.isActive ? "Disable" : "Enable"} ${c.name}`}
                    className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition ${
                      c.isActive ? "bg-[var(--admin-accent)]" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`h-5 w-5 rounded-full bg-white transition-transform ${
                        c.isActive ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </form>

                <Link
                  href={`/admin/orders/carriers?edit=${c.id}`}
                  aria-label={`Edit ${c.name}`}
                  className="text-xs font-medium text-slate-500 hover:text-[var(--admin-accent)]"
                >
                  Edit
                </Link>

                <form action={deleteCarrier}>
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    aria-label={`Remove ${c.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ---------- Catalogue ---------- */}
      <SectionCard title="Add carriers">
        <form className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px_auto]">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search by carrier or country…"
            aria-label="Search carriers"
            className={fieldInput}
          />
          <select name="region" defaultValue={region} className={fieldSelect} aria-label="Region">
            <option value="">All countries</option>
            {CATALOGUE_REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Search
          </button>
        </form>

        {slice.length === 0 ? (
          <p className="text-sm text-slate-500">
            {available.length === 0 && !q && !region
              ? "Every carrier in the catalogue has been added."
              : "No carriers match that search."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {slice.map((c) => (
              <div key={c.key} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4">
                <CarrierMark monogram={c.monogram} colour={c.colour} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
                  <p className="truncate text-xs text-slate-400">{c.region}</p>
                </div>
                <form action={addCatalogueCarrier}>
                  <input type="hidden" name="key" value={c.key} />
                  <button
                    type="submit"
                    className="rounded-full border border-[var(--admin-accent)] px-4 py-1.5 text-xs font-semibold text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
                  >
                    Add
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}

        {pages > 1 ? (
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
            <p className="text-xs text-slate-500">
              Page {page} of {pages} &middot; {available.length} available
            </p>
            <div className="flex gap-2">
              <Link
                href={`/admin/orders/carriers${qs({ page: String(page - 1) })}`}
                aria-disabled={page === 1}
                className={`rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium transition ${
                  page === 1 ? "pointer-events-none text-slate-300" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Previous
              </Link>
              <Link
                href={`/admin/orders/carriers${qs({ page: String(page + 1) })}`}
                aria-disabled={page === pages}
                className={`rounded-full border border-slate-200 px-4 py-1.5 text-xs font-medium transition ${
                  page === pages ? "pointer-events-none text-slate-300" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Next
              </Link>
            </div>
          </div>
        ) : null}
      </SectionCard>

      {/* ---------- Custom ---------- */}
      <SectionCard title="Add a carrier by hand">
        <form action={addCustomCarrier} className="space-y-7">
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Name" htmlFor="customName">
              <input id="customName" name="name" required placeholder="Local courier" className={fieldInput} />
            </Field>
            <Field label="Country / region" htmlFor="customRegion">
              <input id="customRegion" name="region" placeholder="Canada" className={fieldInput} />
            </Field>
            <MediaPicker name="logoUrl" label="Logo (optional)" hint="Square PNG or SVG. Falls back to coloured initials." />
            <Field label="Tile colour" htmlFor="customColour">
              <input id="customColour" name="colour" placeholder="#334155" className={fieldInput} />
            </Field>
          </div>
          <Field label="Tracking URL (optional)" htmlFor="customTrack">
            <input
              id="customTrack"
              name="trackUrl"
              placeholder="https://carrier.example/track?number={n}"
              className={fieldInput}
            />
          </Field>
          <button type="submit" className={btnPrimary}>Add carrier</button>
        </form>
      </SectionCard>
    </div>
  );
}
