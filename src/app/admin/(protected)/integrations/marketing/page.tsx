import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { Card, btnPrimary } from "@/components/admin/ui";
import { saveMarketingTools } from "./actions";
import { MARKETING_TOOLS } from "./tools";
import { requireCapability } from "@/lib/permissions";

export const metadata: Metadata = { title: "Marketing tools" };
export const dynamic = "force-dynamic";

export default async function MarketingToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireCapability("settings");
  const [{ saved }, s] = await Promise.all([searchParams, getSettings()]);

  return (
    <form action={saveMarketingTools} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Marketing tools
        </h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>

      <Card className="p-6">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Advanced settings</h2>
        <p className="mb-6 text-sm text-slate-500">
          Tracking IDs are stored here and injected into the storefront&rsquo;s
          &lt;head&gt; when it is built. None of them load inside the admin.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MARKETING_TOOLS.map((tool) => {
            const enabled = (s[`${tool.key}.enabled`] ?? "0") === "1";
            const value = s[`${tool.key}.id`] ?? "";

            return (
              <div key={tool.key} className="rounded-2xl bg-slate-50 p-5">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {tool.label}
                  </h3>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      name={`${tool.key}.enabled`}
                      defaultChecked={enabled}
                      className="peer sr-only"
                    />
                    <span className="sr-only">Enable {tool.label}</span>
                    <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-[var(--admin-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--admin-accent)]/40" />
                    <span className="pointer-events-none absolute left-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
                  </label>
                </div>

                <p className="mb-4 text-xs leading-relaxed text-slate-500">
                  {tool.blurb}
                </p>

                <input
                  name={`${tool.key}.id`}
                  defaultValue={value}
                  placeholder={tool.placeholder}
                  aria-label={`${tool.label} identifier`}
                  className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--admin-accent)]"
                />
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex justify-end gap-3 pb-2">
        <button type="submit" className={`${btnPrimary} px-8`}>
          Save changes
        </button>
      </div>
    </form>
  );
}
