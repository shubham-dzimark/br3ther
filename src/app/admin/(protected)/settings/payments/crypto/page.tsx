import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SectionCard, Field, fieldInput, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { requireCapability } from "@/lib/permissions";
import { CRYPTO_ENDPOINT_PLACEHOLDER, getCryptoConfig, getSiteData } from "@/lib/crypto-pay";
import { saveCryptoSettings } from "../actions";
import { GatewayIcon } from "@/components/admin/GatewayIcon";

export const metadata: Metadata = { title: "Crypto Payment" };
export const dynamic = "force-dynamic";

const RESULTS: Record<string, { tone: "ok" | "bad"; text: string }> = {
  ok: { tone: "ok", text: "Connection validated — Crypto Payment is active." },
  no_https: { tone: "bad", text: "The admin endpoint URL must use HTTPS." },
  incomplete: { tone: "bad", text: "Fill in the endpoint URL and both keys to activate." },
  fail: { tone: "bad", text: "Connection failed" },
};

const MASK = "••••••••••••";

type Row = { methodKey: string; label: string; network: string; fee: string; symbol: string; rate: string | null };

/**
 * Crypto Payment settings (class-crypto-settings.php + the gateway's own
 * Enable/Disable and Title): the portal endpoint and keys, site currency,
 * test/live mode, the customer description, "Save & Validate", the status,
 * and - once active - the payment methods the portal has switched on.
 */
export default async function CryptoSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; detail?: string }>;
}) {
  await requireCapability("settings");
  const [{ result, detail }, cfg, method] = await Promise.all([
    searchParams,
    getCryptoConfig(),
    prisma.paymentMethod.findUnique({ where: { key: "crypto" } }),
  ]);
  const enabled = method?.isEnabled ?? true;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com";
  const message = result ? RESULTS[result] : undefined;

  // The activated methods table, only while the gateway is active.
  let rows: Row[] | null = null;
  let tableError = false;
  if (cfg.active) {
    const res = await getSiteData(cfg, cfg.currency);
    const methods = res.ok && Array.isArray(res.data?.methods) ? (res.data.methods as unknown[]) : [];
    if (!res.ok || methods.length === 0) {
      tableError = true;
    } else {
      rows = methods.flatMap((m) => {
        if (!m || typeof m !== "object") return [];
        const r = m as Record<string, unknown>;
        const rate = r.rate && typeof r.rate === "object" ? (r.rate as Record<string, unknown>) : null;
        return [
          {
            methodKey: String(r.method_key ?? ""),
            label: String(r.label ?? ""),
            network: String(r.network ?? ""),
            fee: String(r.fee_crypto ?? ""),
            symbol: String(r.symbol ?? ""),
            rate: rate && rate.value !== undefined && rate.value !== null ? String(rate.value) : null,
          },
        ];
      });
    }
  }

  return (
    <div className="space-y-5">
      <form action={saveCryptoSettings} className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <GatewayIcon gateway="crypto" size={40} />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Crypto Payment</h1>
          {cfg.active ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">● Active</span>
          ) : (
            <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">● Inactive</span>
          )}
        </div>

        {message ? (
          <p
            role="status"
            className={`rounded-2xl border px-5 py-4 text-sm ${
              message.tone === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {message.text}
            {result === "fail"
              ? `: ${detail || "unknown error"}. The gateway is disabled until this succeeds.`
              : ""}
          </p>
        ) : null}

        <SectionCard title="Gateway">
          <label className="mb-7 flex items-center gap-3 text-sm text-slate-700">
            <input type="checkbox" name="enabled" defaultChecked={enabled} className="h-4 w-4 accent-[var(--admin-accent)]" />
            Enable Crypto Payment
          </label>
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Title" htmlFor="cryptoTitle" hint="Payment method title shown at checkout.">
              <input id="cryptoTitle" name="title" defaultValue={cfg.title} className={fieldInput} />
            </Field>
            <Field label="Status" htmlFor="cryptoStatus">
              <p id="cryptoStatus" className="rounded-full border border-slate-200 px-5 py-3 text-sm">
                {cfg.active ? (
                  <span className="font-semibold text-emerald-700">● Active</span>
                ) : (
                  <span className="font-semibold text-rose-700">● Inactive</span>
                )}
              </p>
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Connection">
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Admin endpoint URL" htmlFor="endpointUrl" hint="Base URL of the admin dashboard (HTTPS).">
              <input
                id="endpointUrl"
                name="endpoint_url"
                type="url"
                required
                defaultValue={cfg.endpointUrl}
                placeholder={CRYPTO_ENDPOINT_PLACEHOLDER}
                autoComplete="off"
                className={fieldInput}
              />
            </Field>
            <Field label="Site currency" htmlFor="currency">
              <select id="currency" name="currency" defaultValue={cfg.currency} className={fieldInput}>
                <option value="CAD">CAD</option>
                <option value="USD">USD</option>
              </select>
            </Field>
            <Field
              label="Static API key"
              htmlFor="staticKey"
              hint={cfg.staticKey ? "Saved. Leave blank to keep it, or type a new key to replace it." : undefined}
            >
              <input
                id="staticKey"
                name="static_key"
                type="password"
                autoComplete="new-password"
                placeholder={cfg.staticKey ? MASK : ""}
                required={!cfg.staticKey}
                className={fieldInput}
              />
            </Field>
            <Field
              label="Site API key"
              htmlFor="siteKey"
              hint={
                cfg.siteKey
                  ? "Saved. Leave blank to keep it, or type a new key to replace it."
                  : "Generated when the site is added in the admin dashboard."
              }
            >
              <input
                id="siteKey"
                name="site_key"
                type="password"
                autoComplete="new-password"
                placeholder={cfg.siteKey ? MASK : ""}
                required={!cfg.siteKey}
                className={fieldInput}
              />
            </Field>
          </div>

          <fieldset className="mt-7">
            <legend className="mb-2 text-sm font-medium text-slate-700">Mode</legend>
            <label className="mb-2 flex items-center gap-3 text-sm text-slate-700">
              <input type="radio" name="mode" value="test" defaultChecked={cfg.mode === "test"} className="h-4 w-4 accent-[var(--admin-accent)]" />
              Test (visible to administrators only)
            </label>
            <label className="flex items-center gap-3 text-sm text-slate-700">
              <input type="radio" name="mode" value="live" defaultChecked={cfg.mode === "live"} className="h-4 w-4 accent-[var(--admin-accent)]" />
              Live (visible to all customers)
            </label>
          </fieldset>
        </SectionCard>

        <SectionCard title="Customer page">
          <Field label="Customer description" htmlFor="description" hint="Shown to the customer on the payment page. Basic HTML is allowed.">
            <textarea id="description" name="description" rows={5} defaultValue={cfg.description} className={fieldTextarea} />
          </Field>
          <div className="mt-6 rounded-2xl bg-slate-50 px-5 py-4 text-xs leading-relaxed text-slate-600">
            <p>
              <strong>Payment page:</strong> built in. After checkout each crypto order goes to{" "}
              <code className="break-all rounded bg-white px-1">{siteUrl}/checkout/crypto/&lt;order&gt;</code>, reached through a
              private link - no page or shortcode to set up.
            </p>
            <p className="mt-2">
              <strong>Callbacks for the portal:</strong>{" "}
              <code className="break-all rounded bg-white px-1">POST {siteUrl}/api/crypto-pay/v1/order-status</code> and{" "}
              <code className="break-all rounded bg-white px-1">GET {siteUrl}/api/crypto-pay/v1/order</code>, authenticated with
              the same two keys.
            </p>
          </div>
        </SectionCard>

        <div className="flex justify-end pb-2">
          <button type="submit" className={`${btnPrimary} px-8`}>
            Save &amp; Validate
          </button>
        </div>
      </form>

      {cfg.active ? (
        <SectionCard title="Activated payment methods">
          {tableError || !rows ? (
            <p className="text-sm text-slate-600">
              No payable currencies are currently available (check that wallets are enabled and exchange rates are
              fresh).
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4 font-semibold">Logo</th>
                      <th className="py-2 pr-4 font-semibold">Currency</th>
                      <th className="py-2 pr-4 font-semibold">Network</th>
                      <th className="py-2 pr-4 font-semibold">Wallet fee</th>
                      <th className="py-2 font-semibold">Exchange rate ({cfg.currency})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.methodKey}>
                        <td className="py-3 pr-4">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/crypto/asset?type=logo&method=${encodeURIComponent(r.methodKey)}`}
                            alt=""
                            width={28}
                            height={28}
                          />
                        </td>
                        <td className="py-3 pr-4 font-medium text-slate-900">{r.label}</td>
                        <td className="py-3 pr-4 text-slate-600">{r.network}</td>
                        <td className="py-3 pr-4 text-slate-600">
                          {r.fee} {r.symbol}
                        </td>
                        <td className="py-3 text-slate-600">
                          {r.rate !== null ? (
                            `1 ${r.symbol} = ${r.rate} ${cfg.currency}`
                          ) : (
                            <span className="text-rose-700">unavailable</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Rates are the latest values from the admin dashboard for your site currency ({cfg.currency}).
              </p>
            </>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
