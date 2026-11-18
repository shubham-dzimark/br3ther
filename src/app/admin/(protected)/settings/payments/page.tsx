import Link from "next/link";
import type { Metadata } from "next";
import { SectionCard } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { GatewayIcon } from "@/components/admin/GatewayIcon";
import { requireCapability } from "@/lib/permissions";
import { listGateways } from "@/lib/payment-gateways";
import { saveGateways } from "./actions";

export const metadata: Metadata = { title: "Payment gateways" };
export const dynamic = "force-dynamic";

/**
 * Every payment gateway in one list: switch each on or off and see at a glance
 * whether it is ready. The checkout title and everything else live on each
 * gateway's own settings page, so there is one place to edit them.
 */
export default async function PaymentGatewaysPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireCapability("settings");
  const [{ saved }, gateways] = await Promise.all([searchParams, listGateways()]);
  const anyOn = gateways.some((g) => g.enabled);

  return (
    <form action={saveGateways} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Payment gateways</h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      {!anyOn ? (
        <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Every gateway is switched off, so checkout cannot take an order until one is on again.
        </p>
      ) : null}

      <SectionCard title="Gateways">
        <p className="mb-6 text-xs leading-relaxed text-slate-500">
          Tick a gateway to offer it at checkout. A gateway that is on but not ready - crypto before
          its connection is validated, or in test mode for anyone who is not signed in to the admin -
          stays hidden from customers. Titles and details are under each gateway&rsquo;s Settings.
        </p>

        <ul className="divide-y divide-slate-100">
          {gateways.map((g) => (
            <li key={g.key} className="flex flex-wrap items-center gap-x-5 gap-y-3 py-5">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-4">
                <input
                  type="checkbox"
                  name={`enabled_${g.key}`}
                  defaultChecked={g.enabled}
                  className="h-5 w-5 shrink-0 accent-[var(--admin-accent)]"
                />
                <GatewayIcon gateway={g.key} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{g.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {g.note || `Shown at checkout as “${g.title}”`}
                  </span>
                </span>
              </label>

              <div className="ml-auto flex items-center gap-3">
                {g.ready ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Not ready
                  </span>
                )}

                <Link
                  href={g.adminHref}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
                >
                  Settings
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="flex justify-end pb-2">
        <button type="submit" className={`${btnPrimary} px-8`}>
          Save gateways
        </button>
      </div>
    </form>
  );
}
