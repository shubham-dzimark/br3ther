import type { Metadata } from "next";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { SectionCard } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { saveMaintenanceSettings } from "../actions";
import { requireCapability } from "@/lib/permissions";

export const metadata: Metadata = { title: "Maintenance" };
export const dynamic = "force-dynamic";

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireCapability("settings");
  const [{ saved }, s] = await Promise.all([searchParams, getSettings()]);
  const on = s[SETTING_KEYS.maintenanceMode] === "1";

  return (
    <form action={saveMaintenanceSettings} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Maintenance
        </h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      <SectionCard title="Storefront availability">
        <div
          className={`mb-6 rounded-2xl px-4 py-3 text-sm ${
            on
              ? "border border-amber-200 bg-amber-50 text-amber-800"
              : "border border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          The storefront is currently{" "}
          <strong>{on ? "in maintenance mode" : "live"}</strong>.
        </div>

        <label className="flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="maintenanceMode"
            defaultChecked={on}
            className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
          />
          Put the storefront into maintenance mode
        </label>
        <p className="mt-2 text-xs text-slate-400">
          The admin at /admin stays reachable either way, so you can never lock
          yourself out with this switch.
        </p>
      </SectionCard>

      <SectionCard title="System">
        <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2">
          <dt className="text-slate-500">Application</dt>
          <dd className="text-slate-900">Next.js 16 · React 19</dd>
          <dt className="text-slate-500">Database</dt>
          <dd className="text-slate-900">PostgreSQL 18 via Prisma 7</dd>
          <dt className="text-slate-500">Runtime</dt>
          <dd className="text-slate-900">Node 22 (systemd service “br3thr”)</dd>
          <dt className="text-slate-500">Restart command</dt>
          <dd className="font-mono text-xs text-slate-900">
            systemctl restart br3thr
          </dd>
        </dl>
      </SectionCard>

      <div className="flex justify-end pb-2">
        <button type="submit" className={`${btnPrimary} px-8`}>
          Save
        </button>
      </div>
    </form>
  );
}
