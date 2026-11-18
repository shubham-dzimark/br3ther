import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { centsToInput } from "@/lib/money";
import { getEmtConfig, adjustmentMessage } from "@/lib/emt";
import { getPortalConfig, PORTAL_URL_PLACEHOLDER } from "@/lib/portal";
import { SectionCard, Field, fieldInput, fieldTextarea } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { savePaymentSettings, testPortalConnection } from "../../actions";
import { requireCapability } from "@/lib/permissions";
import { GatewayIcon } from "@/components/admin/GatewayIcon";

export const metadata: Metadata = { title: "Payment (EMT)" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; test?: string; code?: string; detail?: string }>;
}) {
  await requireCapability("settings");
  const [{ saved, test: testState, code: testCode, detail: testDetail }, s, method, emt, pendingCount, portal] =
    await Promise.all([
    searchParams,
    getSettings(),
    prisma.paymentMethod.findUnique({ where: { key: "emt" } }),
    getEmtConfig(),
    prisma.order.count({ where: { status: "AWAITING_PAYMENT" } }),
    getPortalConfig(),
  ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com";

  const enabled = method?.isEnabled ?? true;

  return (
    <form action={savePaymentSettings} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <GatewayIcon gateway="emt" size={40} />
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Payment — Interac e-Transfer
        </h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      <SectionCard title="Gateway">
        <label className="mb-7 flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="enabled_emt"
            defaultChecked={enabled}
            className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
          />
          Enable Interac e-Transfer at checkout
        </label>

        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field label="Title shown at checkout" htmlFor="emtTitle">
            <input id="emtTitle" name="emtTitle" defaultValue={s[SETTING_KEYS.emtTitle]} className={fieldInput} />
          </Field>
          <Field label="Description shown at checkout" htmlFor="emtDescription">
            <input id="emtDescription" name="emtDescription" defaultValue={s[SETTING_KEYS.emtDescription]} className={fieldInput} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Recipient">
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field label="Recipient email" htmlFor="emtRecipientEmail">
            <input
              id="emtRecipientEmail"
              name="emtRecipientEmail"
              type="email"
              defaultValue={s[SETTING_KEYS.emtRecipientEmail]}
              placeholder="Where customers send the transfer"
              className={fieldInput}
            />
          </Field>
          <Field label="Recipient name" htmlFor="emtRecipientName">
            <input id="emtRecipientName" name="emtRecipientName" defaultValue={s[SETTING_KEYS.emtRecipientName]} className={fieldInput} />
          </Field>
          <Field label="Bank name" htmlFor="emtBankName">
            <input id="emtBankName" name="emtBankName" defaultValue={s[SETTING_KEYS.emtBankName]} className={fieldInput} />
          </Field>
        </div>
        {!s[SETTING_KEYS.emtRecipientEmail] ? (
          <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No recipient email set. Until you add one, order instructions and
            emails will reference a blank address.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Security answer">
        <label className="mb-6 flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="emtAutoDeposit"
            defaultChecked={s[SETTING_KEYS.emtAutoDeposit] === "1"}
            className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
          />
          Auto-deposit is enabled on this account
        </label>
        <p className="mb-7 text-xs text-slate-400">
          With auto-deposit on, no security answer is needed and the fields below
          are ignored.
        </p>

        <label className="mb-6 flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="emtUseRandomAnswer"
            defaultChecked={s[SETTING_KEYS.emtUseRandomAnswer] === "1"}
            className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
          />
          Generate a random 6-character answer for every order
        </label>

        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field label="Static answer" htmlFor="emtStaticAnswer">
            <input
              id="emtStaticAnswer"
              name="emtStaticAnswer"
              defaultValue={s[SETTING_KEYS.emtStaticAnswer]}
              placeholder="Used when random answers are off"
              className={fieldInput}
            />
          </Field>
          <Field label="Security question" htmlFor="emtSecurityQuestion">
            <input
              id="emtSecurityQuestion"
              name="emtSecurityQuestion"
              defaultValue={s[SETTING_KEYS.emtSecurityQuestion]}
              className={fieldInput}
            />
          </Field>
        </div>
        <p className="mt-3 px-5 text-xs text-slate-400">
          Random answers avoid ambiguous characters (no O/0 or I/1), so they can
          be read aloud without confusion.
        </p>
      </SectionCard>

      <SectionCard title="Discount / surcharge">
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
          <Field label="Adjustment percent" htmlFor="emtAdjustPercent">
            <input
              id="emtAdjustPercent"
              name="emtAdjustPercent"
              inputMode="decimal"
              defaultValue={s[SETTING_KEYS.emtAdjustPercent]}
              className={fieldInput}
            />
          </Field>
          <Field label="Message" htmlFor="emtAdjustMessage">
            <input
              id="emtAdjustMessage"
              name="emtAdjustMessage"
              defaultValue={s[SETTING_KEYS.emtAdjustMessage]}
              placeholder="Use [discount] for the percent"
              className={fieldInput}
            />
          </Field>
        </div>
        <p className="mt-3 px-5 text-xs text-slate-400">
          Applied to the cart subtotal when this method is chosen. Positive = a
          discount, negative = a surcharge, 0 disables it.
          {emt.adjustPercent ? (
            <>
              {" "}
              Customers currently see: <em>{adjustmentMessage(emt)}</em>
            </>
          ) : null}
        </p>
      </SectionCard>

      <SectionCard title="Order limits & expiry">
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Minimum order" htmlFor="emtMinOrder">
            <input
              id="emtMinOrder"
              name="emtMinOrder"
              inputMode="decimal"
              defaultValue={centsToInput(Number(s[SETTING_KEYS.emtMinOrderCents]) || 0)}
              className={fieldInput}
            />
          </Field>
          <Field label="Maximum order" htmlFor="emtMaxOrder">
            <input
              id="emtMaxOrder"
              name="emtMaxOrder"
              inputMode="decimal"
              defaultValue={centsToInput(Number(s[SETTING_KEYS.emtMaxOrderCents]) || 0)}
              className={fieldInput}
            />
          </Field>
          <Field label="Show instructions for (hours)" htmlFor="emtExpiryHours">
            <input
              id="emtExpiryHours"
              name="emtExpiryHours"
              type="number"
              min="1"
              defaultValue={s[SETTING_KEYS.emtExpiryHours]}
              className={fieldInput}
            />
          </Field>
          <Field label="Auto-cancel unpaid after (days)" htmlFor="emtAutoCancelDays">
            <input
              id="emtAutoCancelDays"
              name="emtAutoCancelDays"
              type="number"
              min="0"
              defaultValue={s[SETTING_KEYS.emtAutoCancelDays]}
              className={fieldInput}
            />
          </Field>
        </div>
        <p className="mt-3 px-5 text-xs text-slate-400">
          Set either limit to 0 to disable it. Auto-cancel of 0 leaves unpaid
          orders alone. There {pendingCount === 1 ? "is" : "are"} currently{" "}
          {pendingCount} order{pendingCount === 1 ? "" : "s"} awaiting payment.
        </p>
      </SectionCard>

      <SectionCard title="Checkout instructions">
        <Field label="Instructions" htmlFor="emtInstructions">
          <textarea
            id="emtInstructions"
            name="emtInstructions"
            rows={6}
            defaultValue={s[SETTING_KEYS.emtInstructions]}
            className={fieldTextarea}
          />
        </Field>
        <p className="mt-3 px-5 text-xs text-slate-400">
          Placeholders: <code>[email]</code> recipient address, <code>[amount]</code>{" "}
          order total, <code>[order]</code> order number, <code>[answer]</code>{" "}
          security answer. Shown on the order-received page and in the
          confirmation email.
        </p>

        <label className="mt-7 flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="emtDebugLog"
            defaultChecked={s[SETTING_KEYS.emtDebugLog] === "1"}
            className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
          />
          Write diagnostic messages to the service log
        </label>
        <p className="mt-2 text-xs text-slate-400">
          Read them with <code>journalctl -u br3thr</code>.
        </p>
      </SectionCard>

      <SectionCard title="Pay Portal Sync">
        <label className="mb-7 flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="portalEnabled"
            defaultChecked={s[SETTING_KEYS.portalEnabled] === "1"}
            className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
          />
          Push e-Transfer orders to the Pay Portal and accept its callbacks.
        </label>

        <div className="space-y-7">
          <div>
            <Field label="Portal URL" htmlFor="portalUrl">
              <input
                id="portalUrl"
                name="portalUrl"
                type="url"
                defaultValue={s[SETTING_KEYS.portalUrl]}
                placeholder={PORTAL_URL_PLACEHOLDER}
                className={fieldInput}
              />
            </Field>
            <p className="mt-2 px-5 text-xs text-slate-400">
              The endpoint the portal gave you for receiving orders. Must be https.
            </p>
          </div>

          <div>
            <Field label="Portal token" htmlFor="portalToken">
              <input
                id="portalToken"
                name="portalToken"
                type="password"
                autoComplete="off"
                defaultValue={portal.token ? "••••••••••••••••••••••••" : ""}
                placeholder="Paste your portal token here"
                className={fieldInput}
              />
            </Field>
            <p className="mt-2 px-5 text-xs text-slate-400">
              Shared token from the portal. Must be at least 16 characters &mdash;
              shorter tokens are rejected, and callbacks are refused entirely until
              one is set. Leave blank to keep the stored token; it is never shown back.
            </p>
          </div>

          <div>
            <Field label="Signing secret" htmlFor="portalSigningSecret">
              <input
                id="portalSigningSecret"
                name="portalSigningSecret"
                type="password"
                autoComplete="off"
                defaultValue={portal.signingSecret ? "••••••••••••••••" : ""}
                className={fieldInput}
              />
            </Field>
            <p className="mt-2 px-5 text-xs text-slate-400">
              Optional. When set, every push carries an{" "}
              <code>X-VT-Signature</code> HMAC of the body so the portal can prove
              the request came from this store, even if the token leaks. Leave blank
              if your portal does not support it.
            </p>
          </div>
        </div>

        <div
          className={`mt-6 rounded-2xl px-4 py-3 text-sm ${
            portal.usable
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {portal.usable
            ? "Sync is active. Orders are pushed when placed and whenever their status changes."
            : `Sync is inactive. ${portal.reason ?? ""}`}
        </div>
      </SectionCard>

      <SectionCard
        title="Test connection"
        action={
          <button
            type="submit"
            formAction={testPortalConnection}
            formNoValidate
            className="rounded-full border border-[var(--admin-accent)] px-5 py-2 text-sm font-medium text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
          >
            Send test request
          </button>
        }
      >
        <p className="text-sm text-slate-600">
          Sends a harmless test payload to the portal URL and reports what comes
          back. Save your changes first &mdash; the test uses the stored settings.
        </p>

        {testState === "ok" ? (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Portal replied {testCode ?? "200"}. The connection works.
          </p>
        ) : null}
        {testState === "fail" ? (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {testDetail || "The portal could not be reached."}
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Endpoints for the portal">
        <p className="mb-4 text-sm text-slate-600">
          Where the portal calls back once a transfer settles. Send the token in
          the <code>X-VT-Token</code> header.
        </p>
        <p className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          The shop also answers at the WooCommerce plugin&rsquo;s own addresses
          (<code>{siteUrl}/wp-json/ipp-sync/v1/update-order</code> and
          <code>…/get-order</code>), so adding the site to the portal with just
          its address, <code>{siteUrl}</code>, is enough. Use the https address
          without <code>www</code>, and paste the same token here.
        </p>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="w-16 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-600">GET</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-800">
                  {siteUrl}/api/portal/get-order?order_id=9
                </td>
                <td className="px-4 py-3 text-right text-xs text-slate-500">Read one order</td>
              </tr>
              <tr>
                <td className="w-16 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-600">POST</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-800">
                  {siteUrl}/api/portal/update-order
                </td>
                <td className="px-4 py-3 text-right text-xs text-slate-500">Confirm a transfer</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mb-2 mt-5 text-sm font-medium text-slate-700">POST body:</p>
        <pre className="overflow-x-auto rounded-2xl bg-slate-900 px-4 py-3 text-xs leading-relaxed text-slate-100">
{`{
  "order_id": 9,
  "record_id": 4567,
  "transfer_status": 1
}`}
        </pre>

        <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          <strong className="text-slate-700">order_id is a number</strong>, matching
          the portal&rsquo;s own contract and the number shown in your orders list:
          order <strong>#0009</strong> is <code>9</code>. The full reference is
          still accepted here for convenience, but the portal itself rejects
          anything non-numeric.
        </p>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          <strong className="text-slate-700">transfer_status:</strong> 0 = still
          awaiting the transfer (order stays awaiting payment), 1 = received (order
          moves to paid, stock is decremented, points and referrals are awarded),
          2 = rejected or reversed (order is cancelled and any redeemed points are
          returned). Orders already delivered, refunded or cancelled are left
          untouched and the callback reports that it was ignored.
        </p>

        <ul className="mt-4 space-y-1.5 text-xs text-slate-500">
          <li>
            With no token set, both endpoints return 503 &mdash; an empty token
            never authorises anything.
          </li>
          <li>
            <code>?token=</code> still works on the GET for compatibility, but the
            response flags it as deprecated: query strings leak into access logs.
          </li>
        </ul>
      </SectionCard>

      <SectionCard title="How settlement works">
        <ol className="list-inside list-decimal space-y-2 text-sm text-slate-600">
          <li>Customer checks out; the order is created as <strong>Awaiting payment</strong>.</li>
          <li>They send an e-Transfer to the address above, quoting the order number.</li>
          <li>You check the bank inbox and press <strong>Confirm payment received</strong> on the order.</li>
          <li>Stock is decremented at that moment &mdash; never at checkout &mdash; so unpaid orders never hold inventory.</li>
        </ol>
        <p className="mt-4 text-xs text-slate-400">
          This differs deliberately from the vicetrip plugin, which decremented at
          checkout and had to restock on auto-cancel. Here an auto-cancelled order
          has nothing to restock.
        </p>
      </SectionCard>

      <div className="flex justify-end pb-2">
        <button type="submit" className={`${btnPrimary} px-8`}>
          Save payment settings
        </button>
      </div>
    </form>
  );
}
