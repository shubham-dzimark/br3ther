"use client";

import { useActionState } from "react";
import { EMPTY_RESULT, type ImportResult } from "@/lib/product-import-result";

/**
 * The upload box and what came of it.
 *
 * A server action rather than a redirect with counts in the address bar,
 * because the useful part of an import is the list of rows that did not go in
 * - which line, and why - and that does not fit in a query string.
 */
export function ProductImportForm({
  action,
}: {
  action: (prev: ImportResult, fd: FormData) => Promise<ImportResult>;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_RESULT);

  const total =
    state.productsCreated + state.productsUpdated + state.optionsCreated + state.optionsUpdated;

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-5">
        <div>
          <label htmlFor="file" className="mb-1.5 block text-sm font-medium text-slate-700">
            CSV file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="block w-full rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-[var(--admin-btn)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--admin-btn-ink)]"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-[var(--admin-btn)] px-5 py-2.5 text-sm font-semibold text-[var(--admin-btn-ink)] transition hover:bg-[var(--admin-btn)] disabled:opacity-60"
        >
          {pending ? "Importing…" : "Import products"}
        </button>
      </form>

      {state.status === "error" ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.message}
        </p>
      ) : null}

      {state.status === "done" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {total === 0 ? (
              "Nothing changed - every row already matched what is stored."
            ) : (
              <>
                <strong>Done.</strong> {count(state.productsCreated, "product")} created,{" "}
                {count(state.productsUpdated, "product")} updated,{" "}
                {count(state.optionsCreated, "option")} added,{" "}
                {count(state.optionsUpdated, "option")} changed.
              </>
            )}
          </div>

          {state.issues.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-amber-200">
              <p className="bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                {count(state.issues.length, "row")} needed attention. Everything else went in.
              </p>
              <ul className="divide-y divide-slate-100 bg-white">
                {state.issues.map((issue, i) => (
                  <li key={`${issue.line}-${i}`} className="flex gap-3 px-4 py-2.5 text-sm">
                    <span className="shrink-0 font-mono text-xs text-slate-400">
                      line {issue.line}
                    </span>
                    <span className="text-slate-700">{issue.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
