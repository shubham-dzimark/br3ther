"use client";
import { orderNo } from "@/lib/order-display";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import type { Carrier } from "@/lib/carriers";
import { saveTracking } from "@/app/admin/(protected)/orders/actions";

/**
 * Add or edit shipment tracking. Portalled to <body> so the admin's sticky
 * chrome can't clip it.
 */
export function TrackingDialog({
  orderId,
  orderNumber,
  existing,
  isShipped,
  carriers,
  /** Store time zone, so the shipped-date default matches the shop. */
  timeZone,
}: {
  timeZone: string;
  orderId: string;
  orderNumber: string;
  existing: { number: string; carrier: string; shippedAt: string } | null;
  isShipped: boolean;
  /** Carriers come from the database now, so the server hands them in. */
  carriers: Carrier[];
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [carrier, setCarrier] = useState(existing?.carrier ?? carriers[0]?.key ?? "other");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const selected = carriers.find((c) => c.key === carrier) ?? carriers[0];
  const regions = Array.from(new Set(carriers.map((c) => c.region))).sort();
  /*
   * The store's date, not the browser's and not UTC: a shipment entered at
   * 6pm Pacific was defaulting to tomorrow because the ISO string is UTC.
   */
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-full bg-[var(--admin-btn)] px-5 py-2.5 text-sm font-semibold text-[var(--admin-btn-ink)] transition hover:bg-[var(--admin-btn)]"
      >
        {existing ? "Edit tracking info" : "Add tracking info"}
      </button>

      {mounted && open
        ? createPortal(
            <>
              <div
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-[70] bg-black/50"
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Tracking for order ${orderNo(orderNumber)}`}
                className="fixed left-1/2 top-1/2 z-[71] w-[min(520px,94vw)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white shadow-2xl"
              >
                <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
                  <h2 className="text-base font-semibold text-slate-900">
                    {existing ? "Edit tracking" : "Add tracking"} &mdash; {orderNo(orderNumber)}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </header>

                <form action={saveTracking} className="space-y-5 px-6 py-5">
                  <input type="hidden" name="orderId" value={orderId} />

                  <div>
                    <label htmlFor="trackingNumber" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Tracking number
                    </label>
                    <input
                      id="trackingNumber"
                      name="trackingNumber"
                      required
                      defaultValue={existing?.number ?? ""}
                      autoComplete="off"
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/15"
                    />
                  </div>

                  <div>
                    <label htmlFor="trackingCarrier" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Shipping provider
                    </label>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg text-xs font-bold text-[var(--on-colour)]"
                        style={selected?.logoUrl ? undefined : { background: selected?.colour }}
                      >
                        {selected?.logoUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={selected.logoUrl}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          selected?.monogram
                        )}
                      </span>
                      <select
                        id="trackingCarrier"
                        name="trackingCarrier"
                        value={carrier}
                        onChange={(e) => setCarrier(e.target.value)}
                        className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[var(--admin-accent)]"
                      >
                        {regions.map((region) => (
                          <optgroup key={region} label={region}>
                            {carriers.filter((c) => c.region === region).map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="shippedAt" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Date shipped
                    </label>
                    <input
                      id="shippedAt"
                      name="shippedAt"
                      type="date"
                      defaultValue={existing?.shippedAt || today}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-[var(--admin-accent)]"
                    />
                  </div>

                  <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="markShipped"
                      defaultChecked={!isShipped}
                      className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
                    />
                    Also mark this order as <strong>Shipped</strong>
                  </label>

                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <SaveButton />
                  </div>
                </form>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-[var(--admin-btn)] px-6 py-2.5 text-sm font-semibold text-[var(--admin-btn-ink)] transition hover:bg-[var(--admin-btn)] disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save tracking"}
    </button>
  );
}
