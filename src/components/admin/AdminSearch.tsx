"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSearch } from "./Icons";

type Hit = {
  id: string;
  name: string;
  status: string;
  image: string | null;
  sku: string | null;
  price: string | null;
  stock: number | null;
};

/** Below this the result set is too broad to be a useful suggestion. */
const MIN_CHARS = 3;

/**
 * Admin product typeahead.
 *
 * Suggestions appear from the third character, debounced so a fast typist
 * makes one request rather than one per keystroke. Every in-flight request is
 * aborted when the next keystroke lands, which is also what stops a slow
 * response overwriting a newer one.
 */
export function AdminSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < MIN_CHARS) {
      setHits([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/search/products?q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { items: Hit[] };
        setHits(data.items);
        setCursor(-1);
        setOpen(true);
      } catch {
        // Aborted or offline - leave the last results rather than blanking the
        // menu under the cursor.
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function go(hit: Hit) {
    setOpen(false);
    router.push(`/admin/products/${hit.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || hits.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c <= 0 ? hits.length - 1 : c - 1));
    } else if (e.key === "Enter" && cursor >= 0) {
      // Only intercept Enter when something is highlighted; otherwise the form
      // submits to the full product list, which is the expected fallback.
      e.preventDefault();
      go(hits[cursor]);
    }
  }

  const showMenu = open && q.trim().length >= MIN_CHARS;

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1 md:max-w-md">
      <form action="/admin/products">
        <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search products..."
          aria-label="Search products"
          autoComplete="off"
          role="combobox"
          aria-expanded={showMenu}
          aria-controls="admin-search-results"
          className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/15"
        />
      </form>

      {showMenu ? (
        <div
          id="admin-search-results"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          {hits.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              {loading ? "Searching…" : `No product matches “${q.trim()}”`}
            </p>
          ) : (
            <>
              <ul className="max-h-[380px] divide-y divide-slate-100 overflow-y-auto">
                {hits.map((h, i) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => go(h)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                        i === cursor ? "bg-slate-50" : ""
                      }`}
                    >
                      {h.image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={h.image}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-lg border border-slate-100 object-cover"
                        />
                      ) : (
                        <span className="h-10 w-10 shrink-0 rounded-lg bg-slate-100" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {h.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-400">
                          {h.sku ? `${h.sku} · ` : ""}
                          {h.status === "PUBLISHED" ? "Published" : "Draft"}
                          {h.stock != null ? ` · ${h.stock} in stock` : ""}
                        </span>
                      </span>
                      {h.price ? (
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--admin-accent)]">
                          {h.price}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(`/admin/products?q=${encodeURIComponent(q.trim())}`);
                }}
                className="w-full border-t border-slate-100 px-4 py-2.5 text-center text-xs font-medium text-[var(--admin-accent)] hover:bg-slate-50"
              >
                See all results for “{q.trim()}”
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
