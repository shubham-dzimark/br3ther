import type { Metadata } from "next";
import { requireCapability } from "@/lib/permissions";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getMailConfig, missingMailFields } from "@/lib/mail";
import { SectionCard, Field, fieldInput } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { saveMailSettings, sendTestEmail, testMailConnection } from "./actions";

export const metadata: Metadata = { title: "Email" };
export const dynamic = "force-dynamic";

const TOGGLES = [
  {
    name: "sendOrderPlaced",
    key: SETTING_KEYS.mailSendOrderPlaced,
    label: "Order confirmation",
    note: "To the customer the moment an order is placed, carrying the e-Transfer details and security answer. This is the one that gets you paid.",
  },
  {
    name: "sendPaymentReceived",
    key: SETTING_KEYS.mailSendPaymentReceived,
    label: "Payment received",
    note: "When staff confirm the transfer landed, or the status is moved to a paid one.",
  },
  {
    name: "sendShipped",
    key: SETTING_KEYS.mailSendShipped,
    label: "Shipped, with tracking",
    note: "When tracking is attached — by hand or through the CSV import. Stays quiet if there is no tracking number to give.",
  },
  {
    name: "sendWelcomeCode",
    key: SETTING_KEYS.mailSendWelcomeCode,
    label: "Welcome code",
    note: "Emails the popup and footer signup code, so it survives closing the tab.",
  },
  {
    name: "sendAdminNewOrder",
    key: SETTING_KEYS.mailSendAdminNewOrder,
    label: "New order — to you",
    note: "A copy of every order to the addresses below, alongside the in-app notification and push.",
  },
] as const;

export default async function MailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; detail?: string }>;
}) {
  const me = await requireCapability("settings");
  const [sp, s, config] = await Promise.all([
    searchParams,
    getSettings(),
    getMailConfig(),
  ]);

  const isOwner = me.role === "OWNER";
  const gaps = missingMailFields(config);
  const passFromEnv = Boolean(process.env.SMTP_PASS?.trim());
  const hasStoredPass = Boolean(s[SETTING_KEYS.mailPass]);

  const saidOk =
    sp.saved === "verified"
      ? "Connected and signed in to the mail server."
      : sp.saved === "sent"
        ? `Test email sent to ${sp.detail ?? "you"}. If it doesn't arrive, check the spam folder.`
        : "Saved.";

  const saidBad =
    sp.error === "forbidden"
      ? "Only a Master can change mail settings."
      : sp.error === "norecipient"
        ? "That isn't a valid email address."
        : sp.detail
          ? decodeURIComponent(sp.detail)
          : "Something went wrong.";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Email
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Outgoing mail for order confirmations, payment and shipping notices.
        </p>
      </div>

      {!isOwner ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Only a Master can change these &mdash; the mailbox password is stored here.
        </p>
      ) : null}

      {sp.saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {saidOk}
        </p>
      ) : null}
      {sp.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <strong className="font-semibold">
            {sp.error === "verify" ? "Could not connect. " : "Failed. "}
          </strong>
          {saidBad}
        </p>
      ) : null}

      {/* State of play, before any of the fields - the single most useful
          thing on this page is whether mail is actually going out. */}
      <div
        className={`rounded-2xl border px-4 py-3.5 text-sm ${
          config.enabled && gaps.length === 0
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        {config.enabled && gaps.length === 0 ? (
          <>
            <strong className="font-semibold">Email is on.</strong> Sending as{" "}
            {config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail}{" "}
            via {config.host}:{config.port}.
          </>
        ) : gaps.length ? (
          <>
            <strong className="font-semibold">Not sending yet.</strong> Still
            needs: {gaps.join(", ")}.
          </>
        ) : (
          <>
            <strong className="font-semibold">Configured but switched off.</strong>{" "}
            Turn on &ldquo;Send email&rdquo; below once a test arrives.
          </>
        )}
      </div>

      {isOwner ? (
        <>
          <form action={saveMailSettings} className="space-y-5">
            <SectionCard title="Mail server">
              <label className="mb-7 flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
                <input
                  type="checkbox"
                  name="mailEnabled"
                  defaultChecked={config.enabled}
                  className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
                />
                <span className="text-sm text-slate-700">
                  Send email
                  <span className="mt-0.5 block text-xs text-slate-500">
                    The master switch. Off means nothing goes out to anyone,
                    whatever the toggles below say. The test button still works
                    while this is off, so you can check settings first.
                  </span>
                </span>
              </label>

              <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
                <Field label="SMTP host" htmlFor="mailHost">
                  <input
                    id="mailHost"
                    name="mailHost"
                    defaultValue={s[SETTING_KEYS.mailHost] || "smtp.zoho.com"}
                    className={fieldInput}
                  />
                </Field>
                <Field label="Port" htmlFor="mailPort">
                  <input
                    id="mailPort"
                    name="mailPort"
                    type="number"
                    min="1"
                    max="65535"
                    defaultValue={s[SETTING_KEYS.mailPort] || "465"}
                    className={fieldInput}
                  />
                </Field>
                <Field label="Username" htmlFor="mailUser">
                  <input
                    id="mailUser"
                    name="mailUser"
                    autoComplete="off"
                    placeholder="contact@br3thr.com"
                    defaultValue={s[SETTING_KEYS.mailUser]}
                    className={fieldInput}
                  />
                </Field>
                <Field
                  label={
                    passFromEnv
                      ? "Password (overridden by .env)"
                      : hasStoredPass
                        ? "Password (saved — type to replace)"
                        : "Password"
                  }
                  htmlFor="mailPass"
                >
                  <input
                    id="mailPass"
                    name="mailPass"
                    type="password"
                    autoComplete="new-password"
                    placeholder={hasStoredPass || passFromEnv ? "••••••••••••" : ""}
                    className={fieldInput}
                  />
                </Field>
              </div>

              <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-500">
                <strong className="text-slate-700">Zoho is split by region</strong>{" "}
                and the host has to match the one your account was created in,
                or you get <code className="rounded bg-white px-1">535 Authentication Failed</code>{" "}
                with a perfectly correct password:{" "}
                <code className="rounded bg-white px-1">smtp.zohocloud.ca</code>{" "}
                (Canada),{" "}
                <code className="rounded bg-white px-1">smtp.zoho.com</code> (US),{" "}
                <code className="rounded bg-white px-1">smtp.zoho.eu</code>,{" "}
                <code className="rounded bg-white px-1">smtp.zoho.in</code>,{" "}
                <code className="rounded bg-white px-1">smtp.zoho.com.au</code>.
                Your region is the one in the{" "}
                <code className="rounded bg-white px-1">zoho-verification</code>{" "}
                DNS record on your domain.{" "}
                <strong className="text-red-600">
                  Note smtp.zoho.ca is not Zoho
                </strong>{" "}
                &mdash; it resolves to an unrelated shared host, so never put
                your password there.
                <br />
                <br />
                Use an <strong>app-specific password</strong> from Zoho &rarr; My
                Account &rarr; Security &rarr; App Passwords &mdash; not your
                normal mailbox password, which will be refused if two-factor is
                on. Port 465 is implicit TLS and 587 is STARTTLS; the port you
                choose sets that automatically.
                {passFromEnv ? (
                  <>
                    {" "}
                    <strong className="text-slate-700">
                      SMTP_PASS is set in .env
                    </strong>
                    , so it is used and this field is ignored.
                  </>
                ) : (
                  <>
                    {" "}
                    To keep the password out of the database entirely, put it in{" "}
                    <code className="rounded bg-white px-1">.env</code> as{" "}
                    <code className="rounded bg-white px-1">SMTP_PASS</code>{" "}
                    instead &mdash; it wins over this field.
                  </>
                )}
              </p>

              {hasStoredPass ? (
                <label className="mt-4 flex items-center gap-3 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    name="clearPass"
                    className="h-4 w-4 accent-[var(--admin-accent)]"
                  />
                  Forget the saved password
                </label>
              ) : null}
            </SectionCard>

            <SectionCard title="Addresses">
              <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
                <Field label="From name" htmlFor="mailFromName">
                  <input
                    id="mailFromName"
                    name="mailFromName"
                    placeholder={s[SETTING_KEYS.storeName] || "Br3thr"}
                    defaultValue={s[SETTING_KEYS.mailFromName]}
                    className={fieldInput}
                  />
                </Field>
                <Field label="From address" htmlFor="mailFromEmail">
                  <input
                    id="mailFromEmail"
                    name="mailFromEmail"
                    type="email"
                    placeholder="contact@br3thr.com"
                    defaultValue={s[SETTING_KEYS.mailFromEmail]}
                    className={fieldInput}
                  />
                </Field>
                <Field label="Reply-to (optional)" htmlFor="mailReplyTo">
                  <input
                    id="mailReplyTo"
                    name="mailReplyTo"
                    type="email"
                    defaultValue={s[SETTING_KEYS.mailReplyTo]}
                    className={fieldInput}
                  />
                </Field>
                <Field label="Send order alerts to" htmlFor="mailAdminRecipients">
                  <input
                    id="mailAdminRecipients"
                    name="mailAdminRecipients"
                    placeholder="you@example.com, warehouse@example.com"
                    defaultValue={s[SETTING_KEYS.mailAdminRecipients]}
                    className={fieldInput}
                  />
                </Field>
              </div>
              <p className="mt-4 px-1 text-xs text-slate-500">
                Most providers, Zoho included, refuse to send from an address
                the account doesn&rsquo;t own &mdash; keep the from address the
                same as the username, or an alias of it. Several alert
                recipients can be separated by commas.
              </p>
            </SectionCard>

            <SectionCard title="PDF invoice">
              <Field label="Attach the invoice to" htmlFor="invoiceOn">
                <select
                  id="invoiceOn"
                  name="invoiceOn"
                  defaultValue={config.invoiceOn}
                  className={fieldInput}
                >
                  <option value="none">Don&apos;t attach an invoice</option>
                  <option value="placed">The order confirmation</option>
                  <option value="paid">The payment-received email</option>
                  <option value="shipped">The shipping email</option>
                  <option value="delivered">When the order is marked delivered</option>
                </select>
              </Field>
              <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-500">
                A PDF built from the order&rsquo;s stored figures, so it always
                states what was actually charged.{" "}
                <strong className="text-slate-700">Payment received</strong> is
                the usual choice &mdash; an invoice before payment is really a
                quote.{" "}
                <strong className="text-slate-700">Marked delivered</strong>{" "}
                sends its own &ldquo;order complete&rdquo; email; the other
                options attach to an email that already goes out.
              </p>
            </SectionCard>

            <SectionCard title="Which emails to send">
              <div className="space-y-3.5">
                {TOGGLES.map((t) => (
                  <label
                    key={t.name}
                    className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5"
                  >
                    <input
                      type="checkbox"
                      name={t.name}
                      defaultChecked={s[t.key] !== "0"}
                      className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
                    />
                    <span className="text-sm text-slate-700">
                      {t.label}
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {t.note}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-7">
                <button type="submit" className={btnPrimary}>
                  Save
                </button>
              </div>
            </SectionCard>
          </form>

          <SectionCard
            title="Test it"
            action={
              <form action={testMailConnection}>
                <button
                  type="submit"
                  className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                >
                  Test connection
                </button>
              </form>
            }
          >
            <form action={sendTestEmail} className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <Field label="Send a test email to" htmlFor="testTo">
                  <input
                    id="testTo"
                    name="testTo"
                    type="email"
                    placeholder={me.email}
                    className={fieldInput}
                  />
                </Field>
              </div>
              <button type="submit" className={btnPrimary}>
                Send test
              </button>
            </form>
            <p className="mt-4 px-1 text-xs text-slate-500">
              Save first &mdash; both buttons use what is stored, not what is
              typed above. &ldquo;Test connection&rdquo; only logs in, so it
              proves the host, port and password without sending anything.
            </p>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
