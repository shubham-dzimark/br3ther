"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Asset = {
  id: string;
  url: string;
  filename: string;
  alt: string | null;
  sizeBytes: number;
};

/**
 * Image field backed by the media library. Submits the chosen URL in a hidden
 * input, so it drops into any existing form without changing its action.
 * You can pick something already uploaded or upload on the spot.
 */
export function MediaPicker({
  name,
  label,
  defaultValue = "",
  hint,
  kind = "image",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  hint?: string;
  /** Which half of the library to browse and upload into. */
  kind?: "image" | "video";
}) {
  const isVideo = kind === "video";
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/media?kind=${kind}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load the media library.");
      const data = await res.json();
      setAssets(data.assets ?? []);
    } catch {
      setError("Could not load the media library.");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch("/api/admin/media", { method: "POST", body: fd });
      const data = await res.json();
      if (data.rejected) {
        setError(
          `${data.rejected} file${data.rejected === 1 ? " was" : "s were"} rejected — check type and size.`,
        );
      }
      if (data.uploaded?.length) {
        setValue(data.uploaded[0].url);
        await load();
      }
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={value} />

      <p className="mb-1.5 text-sm font-medium text-slate-700">{label}</p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {value && isVideo ? (
            <video src={value} muted playsInline className="h-full w-full object-cover" />
          ) : value ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-7 w-7 text-slate-300">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            /* Neutral outline, not an accent one. Picking a file is a
               secondary affordance, and on a dark panel a saturated ring was
               the loudest thing on the screen. */
            className="rounded-[var(--admin-radius-sm)] border border-[var(--admin-line-strong)] bg-[var(--admin-surface)] px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-[var(--admin-inset)]"
          >
            {value ? (isVideo ? "Change video" : "Change image") : "Choose or upload"}
          </button>
          {value ? (
            <button
              type="button"
              onClick={() => setValue("")}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {hint ? <p className="mt-2 text-xs text-slate-400">{hint}</p> : null}

      {mounted && open
        ? createPortal(
            <>
              <div
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-[60] bg-black/50"
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Media library"
                className="fixed left-1/2 top-1/2 z-[61] flex max-h-[85vh] w-[min(920px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
                  <h2 className="text-base font-semibold text-slate-900">
                    Media library
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={busy}
                      className="rounded-full bg-[var(--admin-btn)] px-4 py-2 text-sm font-medium text-[var(--admin-btn-ink)] transition hover:bg-[var(--admin-btn)] disabled:opacity-60"
                    >
                      {busy ? (
                        <span className="flex items-center gap-2">
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3.5 w-3.5 animate-spin">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                          Uploading…
                        </span>
                      ) : (
                        "Upload new"
                      )}
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={isVideo ? "video/*" : "image/*"}
                      multiple
                      onChange={(e) => void upload(e.target.files)}
                      className="hidden"
                    />
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
                  </div>
                </header>

                {error ? (
                  <p className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                    {error}
                  </p>
                ) : null}

                <div className="relative flex-1 overflow-y-auto p-6">
                  {busy ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4 animate-spin text-[var(--admin-accent)]">
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        Uploading…
                      </span>
                    </div>
                  ) : null}
                  {loading ? (
                    <p className="py-16 text-center text-sm text-slate-400">Loading…</p>
                  ) : assets.length === 0 ? (
                    <p className="py-16 text-center text-sm text-slate-500">
                      Nothing in the library yet. Upload your first image.
                    </p>
                  ) : (
                    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                      {assets.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setValue(a.url);
                              setOpen(false);
                            }}
                            title={a.filename}
                            className={`block w-full overflow-hidden rounded-xl border-2 transition ${
                              value === a.url
                                ? "border-[var(--admin-accent)]"
                                : "border-transparent hover:border-slate-300"
                            }`}
                          >
                            {isVideo ? (
                              <video
                                src={a.url}
                                muted
                                playsInline
                                preload="metadata"
                                className="aspect-square w-full bg-slate-100 object-cover"
                              />
                            ) : (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={a.url}
                                alt={a.alt ?? ""}
                                className="aspect-square w-full bg-slate-100 object-cover"
                                loading="lazy"
                              />
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
