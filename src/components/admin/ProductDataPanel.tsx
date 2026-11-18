"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useProductType } from "@/components/admin/ProductTypeFields";

/**
 * The Product data panel: a row of tabs across the top and one panel below,
 * using the full width.
 *
 * It used to be WooCommerce's rail of tabs on the left, which took a 170px
 * column out of every tab for five short labels - the variations table and the
 * attribute lists were squeezed into what was left and stacked as cards on an
 * ordinary laptop. The tabs scroll sideways on a phone rather than wrapping.
 *
 * Which tabs exist depends on the product type, and the type lives in context,
 * so choosing "Variable" reveals Variations immediately instead of after a
 * save. Each tab's contents are rendered by the page and passed in, so the
 * server-rendered cards (variants table, attribute lists) keep working.
 */
export function ProductDataPanel({
  general,
  inventory,
  shipping,
  attributes,
  variations,
}: {
  general: ReactNode;
  inventory: ReactNode;
  /** Woo's Shipping tab; omitted when a page has nothing for it. */
  shipping?: ReactNode;
  attributes: ReactNode;
  variations: ReactNode;
}) {
  const type = useProductType();
  const isVariable = type === "VARIABLE" || type === "GIFT_CARD";

  const tabs = [
    { id: "general", label: "General", icon: "M12 2v20M2 12h20" },
    { id: "inventory", label: "Inventory", icon: "M3 7h18v13H3zM3 7l2-4h14l2 4" },
    ...(shipping
      ? [{ id: "shipping", label: "Shipping", icon: "M3 16V7h11v9M14 10h4l3 3v3h-7M6.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" }]
      : []),
    { id: "attributes", label: "Attributes", icon: "M4 6h16M4 12h16M4 18h10" },
    ...(isVariable
      ? [{ id: "variations", label: "Variations", icon: "M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v7h-7z" }]
      : []),
  ];

  const [active, setActive] = useState("general");
  // The open tab can disappear when the type changes.
  const current = tabs.some((t) => t.id === active) ? active : "general";

  /*
   * Saving is a real navigation - the server action redirects back - so the
   * panel used to come back on General with the page at the top, miles from
   * the row that was just edited. The open tab and the scroll position are
   * remembered per product for the length of the visit, and put back once the
   * new page has laid itself out.
   */
  const tabKey = "nl-product-tab";
  const scrollKey = "nl-product-scroll";

  useEffect(() => {
    const path = window.location.pathname;
    /*
     * Only right after a save. Opening the product fresh should start on
     * General; it is the reload caused by saving that has no business moving
     * the merchant somewhere else.
     */
    const params = new URLSearchParams(window.location.search);
    const afterSave = params.has("saved") || params.has("error");

    let saved: string | null = null;
    let offset: string | null = null;
    try {
      saved = sessionStorage.getItem(`${tabKey}:${path}`);
      offset = sessionStorage.getItem(`${scrollKey}:${path}`);
      sessionStorage.removeItem(`${scrollKey}:${path}`);
    } catch {
      // Private mode, or storage refused - the defaults are fine.
    }
    if (!afterSave) return;
    if (saved) setActive(saved);
    if (offset) {
      const y = Number(offset);
      // After the panel has been painted with the restored tab, or the page is
      // not yet tall enough to scroll that far.
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
    }
  }, []);

  /*
   * Any submit on this page is about to reload it - the save buttons in the
   * table join a form that lives outside this panel, so the listener sits on
   * the document rather than on the panel.
   */
  useEffect(() => {
    const remember = () => {
      try {
        const path = window.location.pathname;
        sessionStorage.setItem(`${tabKey}:${path}`, current);
        sessionStorage.setItem(`${scrollKey}:${path}`, String(Math.round(window.scrollY)));
      } catch {
        // Nothing to do - it simply opens on General as before.
      }
    };
    document.addEventListener("submit", remember, true);
    return () => document.removeEventListener("submit", remember, true);
  }, [current]);

  const choose = (id: string) => {
    setActive(id);
    try {
      sessionStorage.setItem(`${tabKey}:${window.location.pathname}`, id);
    } catch {
      // Nothing to do.
    }
  };

  /*
   * On a phone the tab row scrolls sideways, and the open tab - Variations,
   * say, restored after a save - sat off the right-hand edge where nothing
   * showed which tab was open. Bring it into view within the row only, so the
   * page itself never jumps.
   */
  useEffect(() => {
    const list = document.querySelector<HTMLElement>("[data-product-tabs] [role=tablist]");
    const tab = list?.querySelector<HTMLElement>(`[data-tab-id="${current}"]`);
    if (!list || !tab) return;
    // Measured against the row itself, and moved at once: a smooth scroll needs
    // animation frames, and a tab that is not being painted never got them, so
    // the row stayed put.
    const start = tab.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
    const end = start + tab.offsetWidth;
    if (start < list.scrollLeft || end > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = Math.max(0, start - 16);
    }
  }, [current]);

  return (
    <div className="space-y-5" data-product-tabs>
      {/* The row still scrolls sideways when narrow; the bar it drew under the
          tabs looked like a broken underline, so it is hidden. */}
      <div
        role="tablist"
        aria-label="Product data"
        className="-mx-1 flex gap-1.5 overflow-x-auto border-b border-slate-200 px-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab-id={t.id}
            aria-selected={current === t.id}
            onClick={() => choose(t.id)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
              current === t.id
                ? "bg-[var(--admin-btn)] text-[var(--admin-btn-ink)]"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-4 w-4 shrink-0"
            >
              <path d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </div>

      {/*
        Every panel stays mounted and is hidden with CSS rather than unmounted:
        a half-typed price must still be there when the merchant clicks back,
        and an unmounted field would post nothing at all.
      */}
      <div className="min-w-0">
        <div hidden={current !== "general"}>{general}</div>
        <div hidden={current !== "inventory"}>{inventory}</div>
        {shipping ? <div hidden={current !== "shipping"}>{shipping}</div> : null}
        <div hidden={current !== "attributes"}>{attributes}</div>
        {isVariable ? <div hidden={current !== "variations"}>{variations}</div> : null}
      </div>
    </div>
  );
}
