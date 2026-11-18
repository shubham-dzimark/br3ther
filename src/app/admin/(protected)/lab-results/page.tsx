import Link from "next/link";
import type { Metadata } from "next";
import { requireCapability } from "@/lib/permissions";
import { getLabResults } from "@/lib/lab-results";
import { LabResultsEditor } from "@/components/admin/LabResultsEditor";
import { saveLabResults } from "./actions";

export const metadata: Metadata = { title: "Lab Results" };
export const dynamic = "force-dynamic";

export default async function LabResultsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapability("content");
  const [{ saved, error }, content] = await Promise.all([searchParams, getLabResults()]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Lab Results</h1>
          <p className="mt-1 text-sm text-slate-500">
            The public Lab Results page: add as many test reports as you need, each with its own PDF, plus a FAQ
            that only appears on this page.
          </p>
        </div>
        <Link
          href="/lab-results"
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          View page &rarr;
        </Link>
      </div>

      {saved ? (
        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved. The Lab Results page is updated.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          That save didn&rsquo;t come through. Please try again.
        </p>
      ) : null}

      <LabResultsEditor initial={content} action={saveLabResults} />
    </div>
  );
}
