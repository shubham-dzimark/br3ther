import type { Metadata } from "next";
import { requireCapability } from "@/lib/permissions";
import { PageHeader } from "@/components/admin/ui";
import { ThemeEditorView, type ThemeEditorParams } from "@/components/admin/ThemeEditorView";

export const metadata: Metadata = { title: "Theme Editor" };
export const dynamic = "force-dynamic";

export default async function ThemeEditorPage({ searchParams }: { searchParams: Promise<ThemeEditorParams> }) {
  const me = await requireCapability("settings");
  const sp = await searchParams;

  if (me.role !== "OWNER") {
    return (
      <div>
        <PageHeader title="Theme Editor" />
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Only a Master can edit the storefront theme: these files are the shop&rsquo;s own code.
        </p>
      </div>
    );
  }

  return <ThemeEditorView sp={sp} />;
}
