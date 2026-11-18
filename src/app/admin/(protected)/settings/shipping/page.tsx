import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { centsToInput } from "@/lib/money";
import { getMoneyFormatter } from "@/lib/currency";
import { SectionCard, Field, fieldInput, fieldSelect } from "@/components/admin/Field";
import { btnPrimary, Card } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { IconTrash } from "@/components/admin/Icons";
import { requireCapability } from "@/lib/permissions";
import { ShippingMethodCard } from "@/components/admin/ShippingMethodCard";
import {
  createShippingClass,
  createShippingMethod,
  deleteShippingClass,
  deleteShippingMethod,
  saveShippingMethod,
  saveAddressLookup,
} from "./actions";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

const MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

const ADDRESS_STATUS: Record<string, { tone: string; text: string }> = {
  ok: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Address suggestions are on. The key was tested and works." },
  off: { tone: "border-slate-200 bg-slate-50 text-slate-700", text: "Address suggestions are off." },
  nokey: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Add a Geoapify API key to switch suggestions on." },
  fail: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "The test lookup failed, so suggestions stay off." },
};

export const metadata: Metadata = { title: "Shipping" };
export const dynamic = "force-dynamic";

/**
 * Shipping, laid out like WooCommerce: the methods a customer can choose
 * between, each with a name, a tax status, a cost and the extra that each
 * shipping class adds - and the classes themselves.
 *
 * There are no zones yet. This shop posts within one country, so a zone per
 * province would be a table of identical rows; the note on the page says so,
 * and nothing here would have to change to add them later.
 */
export default async function ShippingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; addr?: string; detail?: string }>;
}) {
  await requireCapability("settings");
  const [{ saved, error, addr, detail }, methods, classes, money, settings] = await Promise.all([
    searchParams,
    prisma.shippingMethod.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { classCosts: { select: { classId: true, costCents: true } } },
    }),
    prisma.shippingClass.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true } } },
    }),
    getMoneyFormatter(),
    getSettings(),
  ]);
  const hasGeoapifyKey = Boolean(settings[SETTING_KEYS.addressGeoapifyKey]?.trim());
  const lookupOn = settings[SETTING_KEYS.addressLookupEnabled] === "1" && hasGeoapifyKey;
  const addressStatus = addr ? ADDRESS_STATUS[addr] : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Shipping
        </h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
        {error ? (
          <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700">
            {error === "name" ? "Give the method a name." : "That did not save."}
          </span>
        ) : null}
      </div>

      <p className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs leading-relaxed text-slate-600">
        Customers see every active method at checkout and pick one; the first on
        the list is chosen for them until they do. The lowest &ldquo;Free
        over&rdquo; here is also what the free-shipping bar counts towards.
      </p>

      {methods.map((method) => (
        <ShippingMethodCard
          key={method.id}
          action={saveShippingMethod}
          remove={
            <form action={deleteShippingMethod}>
              <input type="hidden" name="id" value={method.id} />
              <SubmitButton
                pendingLabel="…"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              >
                <IconTrash className="h-4 w-4" />
              </SubmitButton>
            </form>
          }
          method={{
            id: method.id,
            name: method.name,
            type: method.type,
            taxable: method.taxable,
            cost: centsToInput(method.costCents),
            freeOver: method.freeOverCents ? centsToInput(method.freeOverCents) : "",
            minOrder: method.minOrderCents ? centsToInput(method.minOrderCents) : "",
            note: method.note ?? "",
            isActive: method.isActive,
          }}
          classes={classes.map((c) => {
            const cost = method.classCosts.find((x) => x.classId === c.id);
            return {
              id: c.id,
              name: c.name,
              cost: cost ? centsToInput(cost.costCents) : "",
            };
          })}
        />
      ))}

      <SectionCard title="Add a shipping method">
        <form action={createShippingMethod} className="space-y-6">
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field
              label="Name"
              htmlFor="newName"
              hint="Your customers will see this name during checkout."
            >
              <input id="newName" name="name" required placeholder="Flat rate" className={fieldInput} />
            </Field>
            <Field label="Type" htmlFor="newType">
              <select id="newType" name="type" defaultValue="FLAT" className={fieldSelect}>
                <option value="FLAT">Flat rate</option>
                <option value="FREE">Free shipping</option>
                <option value="PICKUP">Local pickup</option>
              </select>
            </Field>
            <Field label="Cost" htmlFor="newCost" hint="Per order, before any class costs.">
              <input id="newCost" name="cost" inputMode="decimal" placeholder="0.00" className={fieldInput} />
            </Field>
            <Field
              label="Free over"
              htmlFor="newFreeOver"
              hint="Leave empty for never."
            >
              <input id="newFreeOver" name="freeOver" inputMode="decimal" className={fieldInput} />
            </Field>
          </div>
          <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
            <input type="checkbox" name="taxable" defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
            <span className="text-sm text-slate-700">
              Taxable
              <span className="mt-0.5 block text-xs text-slate-500">
                Off means the postage itself is not taxed.
              </span>
            </span>
          </label>
          <div className="flex justify-end">
            <SubmitButton className={btnPrimary} pendingLabel="Adding…">
              Add method
            </SubmitButton>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Shipping classes">
        <p className="mb-5 text-xs leading-relaxed text-slate-500">
          A class groups things that cost the same to post &mdash; Bulky,
          Fragile, Letter. Each method above can charge extra for a class, and a
          product picks its class on its own page. A class is charged once per
          order, not once per item.
        </p>

        {classes.length > 0 ? (
          <ul className="mb-6 divide-y divide-slate-100">
            {classes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    {c._count.products} product{c._count.products === 1 ? "" : "s"}
                    {c.description ? ` · ${c.description}` : ""}
                  </p>
                </div>
                <form action={deleteShippingClass}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton
                    pendingLabel="…"
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <IconTrash className="h-4 w-4" />
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-6 text-sm text-slate-500">No classes yet.</p>
        )}

        <form action={createShippingClass} className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label="Class name" htmlFor="className">
            <input id="className" name="name" required placeholder="Bulky" className={fieldInput} />
          </Field>
          <Field label="Description" htmlFor="classDescription">
            <input id="classDescription" name="description" placeholder="Anything over 5 kg" className={fieldInput} />
          </Field>
          <SubmitButton className={btnPrimary} pendingLabel="Adding…">
            Add class
          </SubmitButton>
        </form>
      </SectionCard>

      <SectionCard title="Address autocomplete at checkout">
        <p className="mb-5 text-xs leading-relaxed text-slate-500">
          As shoppers type their street address at checkout, matching addresses
          appear under the field, and picking one fills in the city, province
          and postal code. Suggestions come from Geoapify: create a free account
          and API key at geoapify.com (the free plan covers about 3,000 lookups a
          day). What a shopper types in the street field is sent to Geoapify to
          find matches; the key stays on the server.
        </p>
        {addressStatus ? (
          <p role="status" className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${addressStatus.tone}`}>
            {addressStatus.text}
            {addr === "fail" && detail ? ` ${detail}` : ""}
          </p>
        ) : null}
        <form action={saveAddressLookup} className="space-y-6">
          <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={lookupOn}
              className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
            />
            <span className="text-sm text-slate-700">
              Show address suggestions at checkout
              <span className="mt-0.5 block text-xs text-slate-500">
                {lookupOn ? "On now." : "Off now."} Saving with this ticked runs a test lookup with the key.
              </span>
            </span>
          </label>
          <div className="max-w-xl">
            <Field
              label="Geoapify API key"
              htmlFor="geoapifyKey"
              hint={
                hasGeoapifyKey
                  ? "Saved. Leave blank to keep it, or type a new key to replace it."
                  : "From your Geoapify project, under API keys."
              }
            >
              <input
                id="geoapifyKey"
                name="geoapifyKey"
                type="password"
                autoComplete="new-password"
                placeholder={hasGeoapifyKey ? MASK : ""}
                className={fieldInput}
              />
            </Field>
          </div>
          {hasGeoapifyKey ? (
            <label className="flex items-center gap-3 px-1 text-sm text-slate-600">
              <input type="checkbox" name="clearKey" className="h-4 w-4 accent-[var(--admin-accent)]" />
              Remove the saved key (also switches suggestions off)
            </label>
          ) : null}
          <div className="flex justify-end">
            <SubmitButton className={btnPrimary} pendingLabel="Testing…">
              Save &amp; test
            </SubmitButton>
          </div>
        </form>
      </SectionCard>

      <Card className="p-5">
        <p className="text-xs leading-relaxed text-slate-500">
          Prices are in {money.format(0).replace(/[\d.,\s]/g, "")} and exclude
          any tax added at checkout. Shipping zones are not used: this shop
          posts within one country, so every order is quoted from the methods
          above.
        </p>
      </Card>
    </div>
  );
}
