"use client";

/**
 * Print trigger. A client component only because it needs window.print().
 *
 * The label is a prop rather than fixed text: the same button sits on the
 * invoice, the packing slip and the barcode sheet, and "Print slip" on an
 * invoice reads like it will print the wrong document.
 */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="shrink-0 rounded-full bg-[var(--admin-btn)] px-6 py-2.5 text-sm font-semibold text-[var(--admin-btn-ink)] transition hover:bg-[var(--admin-btn)]"
    >
      {label}
    </button>
  );
}
