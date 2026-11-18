import Link from "next/link";
import { IconChevronLeft, IconChevronRight } from "./Icons";

/**
 * Numbered pager for admin lists: "Showing 26–50 of 312", rows-per-page, and
 * page links with the current page's neighbours plus the first and last,
 * gaps shown as "…". Plain links, so it works in server components and the
 * page is shareable.
 */

/** 1 … 4 5 [6] 7 8 … 20 */
export function pageWindow(page: number, pages: number): (number | "gap")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => keep.add(n));
  const nums = [...keep].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

export function Pagination({
  page,
  perPage,
  total,
  href,
  perOptions = [25, 50, 100],
  noun = "results",
}: {
  page: number;
  perPage: number;
  total: number;
  /** Builds the link for a page and rows-per-page. */
  href: (page: number, perPage: number) => string;
  perOptions?: number[];
  noun?: string;
}) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const step =
    "flex h-8 min-w-8 items-center justify-center rounded-[var(--admin-radius-sm)] px-2 text-sm transition";
  const idle = `${step} text-slate-600 hover:bg-[var(--admin-inset)] hover:text-slate-900`;
  const off = `${step} pointer-events-none text-slate-300`;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--admin-line)] px-5 py-3 text-sm text-slate-500"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span>
          Showing <span className="font-medium text-slate-800">{from}–{to}</span> of{" "}
          <span className="font-medium text-slate-800">{total}</span> {noun}
        </span>
        <span className="flex items-center gap-1">
          <span className="mr-1 text-xs">Rows</span>
          {perOptions.map((n) => (
            <Link
              key={n}
              href={href(1, n)}
              aria-current={n === perPage ? "true" : undefined}
              className={`rounded-[var(--admin-radius-sm)] px-2 py-0.5 text-xs transition ${
                n === perPage
                  ? "bg-[var(--admin-inset)] font-semibold text-[var(--admin-accent)] ring-1 ring-[var(--admin-line-strong)]"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {n}
            </Link>
          ))}
        </span>
      </div>

      {pages > 1 ? (
        <div className="flex items-center gap-1">
          <Link href={href(page - 1, perPage)} aria-label="Previous page" aria-disabled={page === 1} className={page === 1 ? off : idle}>
            <IconChevronLeft className="h-4 w-4" />
          </Link>
          {pageWindow(page, pages).map((n, i) =>
            n === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-slate-400" aria-hidden="true">
                …
              </span>
            ) : (
              <Link
                key={n}
                href={href(n, perPage)}
                aria-current={n === page ? "page" : undefined}
                className={
                  n === page
                    ? `${step} bg-[var(--admin-inset)] font-semibold text-[var(--admin-accent)] ring-1 ring-[var(--admin-line-strong)]`
                    : idle
                }
              >
                {n}
              </Link>
            ),
          )}
          <Link href={href(page + 1, perPage)} aria-label="Next page" aria-disabled={page === pages} className={page === pages ? off : idle}>
            <IconChevronRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
