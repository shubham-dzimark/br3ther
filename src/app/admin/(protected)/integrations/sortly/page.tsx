import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { SectionCard, Field, fieldInput } from "@/components/admin/Field";
import { btnDanger, btnGhost, btnPrimary } from "@/components/admin/ui";
import { TH } from "@/components/admin/PageCard";
import { ensureWebhookToken, readSortlyConfig } from "@/lib/sortly/sync";
import { regenerateSortlyWebhook, saveSortlySettings, syncSortlyNow, unlinkSortlyVariant } from "./actions";

export const metadata: Metadata = { title: "Sortly Inventory" };
export const dynamic = "force-dynamic";

const MASK = "••••••••••••••••";

const RESULTS: Record<string, { tone: "ok" | "bad"; text: string }> = {
  saved: { tone: "ok", text: "Settings saved." },
  bad_key: { tone: "bad", text: "Sortly rejected that key. Use the secret key (not the key ID) from app.sortly.com/public-api." },
  unreachable: { tone: "bad", text: "Could not reach Sortly to check the key. Nothing was changed; try again." },
  no_key: { tone: "bad", text: "Add your Sortly secret key first." },
  webhook: { tone: "ok", text: "New webhook URL created. Update it in Sortly; the old one no longer works." },
  unlinked: { tone: "ok", text: "Option unlinked. It will be linked again by barcode on the next full sync." },
};

const fmt = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default async function SortlyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireCapability("settings");
  const sp = await searchParams;
  const token = await ensureWebhookToken();
  const cfg = await readSortlyConfig();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com";
  const webhookUrl = `${siteUrl}/api/integrations/sortly/webhook?token=${token}`;

  const syncable = {
    isActive: true,
    manageStock: true,
    product: { type: { notIn: ["GROUPED" as const, "EXTERNAL" as const] }, status: { not: "ARCHIVED" as const } },
  };
  const [linkedCount, totalCount, pending, errors24h, linked, unlinked, log] = await Promise.all([
    prisma.productVariant.count({ where: { ...syncable, sortlyItemId: { not: null } } }),
    prisma.productVariant.count({ where: syncable }),
    prisma.sortlyStockChange.count({ where: { appliedAt: null } }),
    prisma.sortlySyncLog.count({ where: { level: "error", createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    prisma.productVariant.findMany({
      where: { sortlyItemId: { not: null } },
      orderBy: { sortlySyncedAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        stock: true,
        sortlyItemId: true,
        sortlySid: true,
        sortlySyncedAt: true,
        product: { select: { id: true, name: true } },
      },
    }),
    prisma.productVariant.findMany({
      where: { ...syncable, sortlyItemId: null },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { id: true, name: true, sku: true, barcode: true, stock: true, product: { select: { id: true, name: true } } },
    }),
    prisma.sortlySyncLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  const result = sp.result ? RESULTS[sp.result] : undefined;
  const optionLabel = (productName: string, name: string) =>
    name && name !== productName && !/^default/i.test(name) ? `${productName} · ${name}` : productName;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sortly Inventory</h1>
        <p className="mt-1 text-sm text-slate-500">
          Keeps product stock and your Sortly warehouse in step, both ways. Options are matched to Sortly items by
          barcode / QR code. Sortly&rsquo;s count is the master: site sales and cancellations are sent to Sortly as
          changes, and changes made in Sortly come back to the site.
        </p>
      </div>

      {result ? (
        <p
          role={result.tone === "bad" ? "alert" : "status"}
          className={`rounded-2xl border px-4 py-3 text-sm ${
            result.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {result.text}
          {sp.result === "saved" && sp.items ? ` Connected: ${sp.items} items and folders in Sortly.` : ""}
        </p>
      ) : null}
      {sp.ran ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Sync finished: {sp.scanned} Sortly items read, {sp.linked} linked by barcode, {sp.created} created in Sortly,{" "}
          {sp.synced} counts updated, {sp.unmatched} not linked, {sp.errors} error{sp.errors === "1" ? "" : "s"}.
          {sp.msg ? ` ${sp.msg}` : ""}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Sync", value: cfg.enabled ? "On" : "Off", tone: cfg.enabled ? "text-emerald-700" : "text-slate-500" },
          { label: "Linked options", value: `${linkedCount} of ${totalCount}`, tone: "text-slate-900" },
          { label: "Changes waiting", value: String(pending), tone: pending ? "text-amber-700" : "text-slate-900" },
          { label: "Errors (24 h)", value: String(errors24h), tone: errors24h ? "text-red-600" : "text-slate-900" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200/70 bg-white px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className={`mt-1 text-xl font-semibold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <form action={saveSortlySettings}>
        <SectionCard title="Connection">
          <div className="space-y-7">
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5 text-sm text-slate-700">
              <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
              <span>
                <span className="font-medium text-slate-900">Sync stock with Sortly</span>
                <span className="block text-xs text-slate-500">Off stops every automatic update in both directions.</span>
              </span>
            </label>
            <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
              <Field
                label="Sortly secret key"
                htmlFor="secretKey"
                hint={cfg.secretKey ? "Saved. Leave blank to keep it, or paste a new key to replace it." : "From app.sortly.com/public-api. Use the secret key, not the key ID."}
              >
                <input
                  id="secretKey"
                  name="secretKey"
                  type="password"
                  autoComplete="off"
                  placeholder={cfg.secretKey ? MASK : "Paste the secret key"}
                  className={fieldInput}
                />
              </Field>
              <Field
                label="Folder for new items (optional)"
                htmlFor="folderId"
                hint="Sortly folder ID where items created from the site are placed. Blank puts them at the top level."
              >
                <input id="folderId" name="folderId" inputMode="numeric" defaultValue={cfg.folderId ?? ""} className={fieldInput} />
              </Field>
            </div>
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" name="createMissing" defaultChecked={cfg.createMissing} className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
              <span>
                Create items in Sortly for options it doesn&rsquo;t have yet
                <span className="block text-xs text-slate-500">
                  Uses the option&rsquo;s barcode on the Sortly label. An option without a barcode gets one from your Barcode
                  settings first (or its SKU as Code 128 when barcodes are off). Saving a product sends its new options to
                  Sortly straight away.
                </span>
              </span>
            </label>
            <div className="flex justify-end">
              <button type="submit" className={btnPrimary}>
                Save &amp; test connection
              </button>
            </div>
          </div>
        </SectionCard>
      </form>

      <SectionCard title="Instant updates from Sortly (webhook)">
        <ol className="mb-5 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
          <li>
            In Sortly open <strong>Integrations → Webhooks</strong> (app.sortly.com/integrations/webhooks).
          </li>
          <li>Add a webhook with the URL below and tick Created, Edited, Moved and Deleted.</li>
          <li>Save. Stock changes in Sortly then reach the site within seconds, without pressing Sync now.</li>
        </ol>
        <input readOnly value={webhookUrl} aria-label="Webhook URL" className={`${fieldInput} font-mono text-xs`} />
        <p className="mt-2 text-xs text-slate-400">Keep this URL private: it lets Sortly tell the site to re-read items.</p>
        <form action={regenerateSortlyWebhook} className="mt-4">
          <button type="submit" className={btnGhost}>
            Create a new webhook URL
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Sync">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-slate-600">
            <p>
              Runs when Sortly&rsquo;s webhook fires, right after an order is paid or cancelled, and when you press
              Sync now. Last run: {fmt(cfg.lastRun?.at)}
              {cfg.lastRun
                ? ` · ${cfg.lastRun.linked} linked, ${cfg.lastRun.created} created, ${cfg.lastRun.synced} updated, ${cfg.lastRun.errors} errors`
                : ""}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              &ldquo;Sync now&rdquo; reads every Sortly item, links options by barcode, creates missing items and updates all
              counts. Stock you edit by hand on the site is sent to Sortly on the next Sync now. Barcodes are made on the
              site: Sortly labels always carry the site barcode, and a change is sent at once. Products are never imported
              from Sortly. Sortly-printed QR labels also scan in Scan Lookup.
            </p>
          </div>
          <form action={syncSortlyNow}>
            <button type="submit" className={btnPrimary} disabled={!cfg.secretKey}>
              Sync now
            </button>
          </form>
        </div>
      </SectionCard>

      <SectionCard title={`Linked options (${linked.length})`}>
        {linked.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing linked yet. Save your key, then press Sync now.</p>
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80">
                <tr>
                  <TH>Product / option</TH>
                  <TH>Barcode</TH>
                  <TH>Sortly item</TH>
                  <TH align="right">Stock</TH>
                  <TH>Last synced</TH>
                  <TH align="right"> </TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linked.map((v) => (
                  <tr key={v.id}>
                    <td className="px-3 py-3 text-sm text-slate-900 lg:px-5">
                      <Link href={`/admin/products/${v.product.id}`} className="hover:underline">
                        {optionLabel(v.product.name, v.name)}
                      </Link>
                      <span className="block text-xs text-slate-400">{v.sku}</span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600 lg:px-5">{v.barcode ?? "—"}</td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600 lg:px-5">
                      {v.sortlySid ?? `#${v.sortlyItemId}`}
                      {v.sortlySid ? <span className="block text-slate-400">#{v.sortlyItemId}</span> : null}
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-semibold tabular-nums text-slate-900 lg:px-5">{v.stock}</td>
                    <td className="px-3 py-3 text-xs text-slate-500 lg:px-5">{fmt(v.sortlySyncedAt)}</td>
                    <td className="px-3 py-3 text-right lg:px-5">
                      <form action={unlinkSortlyVariant}>
                        <input type="hidden" name="variantId" value={v.id} />
                        <button type="submit" className={btnDanger}>
                          Unlink
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {unlinked.length > 0 ? (
        <SectionCard title="Not linked yet">
          <p className="mb-4 text-xs text-slate-500">
            {cfg.createMissing
              ? "These are linked or created in Sortly on the next full sync."
              : "Give each a barcode that matches its Sortly item, or switch on creating missing items."}
          </p>
          <ul className="divide-y divide-slate-100 text-sm">
            {unlinked.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="text-slate-800">
                  {optionLabel(v.product.name, v.name)}
                  <span className="ml-2 text-xs text-slate-400">{v.sku}</span>
                </span>
                <span className="font-mono text-xs text-slate-500">{v.barcode ?? "no barcode"} · stock {v.stock}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title="Activity">
        {log.length === 0 ? (
          <p className="text-sm text-slate-500">No sync activity yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {log.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5 text-sm">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                    l.level === "error"
                      ? "bg-red-50 text-red-700"
                      : l.level === "warn"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {l.action}
                </span>
                <span className="min-w-0 flex-1 text-slate-700">{l.message}</span>
                <span className="text-xs text-slate-400">{fmt(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
