"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Click-or-drag upload tile with a real progress bar.
 *
 * Posts with XHR rather than submitting a form to a server action: only an XHR
 * reports bytes sent, so this can show an honest 0-100% instead of a spinner
 * that reveals nothing about how long a 3 MB file has left.
 */
export function Dropzone({
  productId,
  kind,
  variantId,
  label,
  accept,
  hint,
  multiple = false,
  tone = "image",
}: {
  /** Not needed for the media library. */
  productId?: string;
  kind: "cover" | "photos" | "video" | "variant" | "library";
  variantId?: string;
  label: string;
  accept: string;
  hint: string;
  multiple?: boolean;
  tone?: "image" | "video";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function upload(files: FileList) {
    if (files.length === 0) return;
    setError(null);
    setProgress(0);

    const library = kind === "library";
    const body = new FormData();
    if (!library) {
      body.append("productId", productId ?? "");
      body.append("kind", kind);
      if (variantId) body.append("variantId", variantId);
    }
    // The media library route reads "files"; the product route reads "file".
    const field = library ? "files" : "file";
    for (const f of Array.from(files)) body.append(field, f);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", library ? "/api/admin/media" : "/api/admin/products/upload");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        // Cap at 99 until the server answers - 100% while still waiting for a
        // response reads as finished when it isn't.
        setProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let rejected = 0;
        try {
          rejected = JSON.parse(xhr.responseText)?.rejected ?? 0;
        } catch {
          // A non-JSON 200 shouldn't happen, but don't crash the tile over it.
        }
        setProgress(100);
        if (rejected > 0) {
          setError(
            `${rejected} file${rejected === 1 ? "" : "s"} rejected — check the type and size limits.`,
          );
        }
        router.refresh();
        window.setTimeout(() => setProgress(null), 700);
      } else {
        setProgress(null);
        setError(xhr.status === 401 ? "Not signed in." : "Upload failed. Try again.");
      }
      if (inputRef.current) inputRef.current.value = "";
    };

    xhr.onerror = () => {
      setProgress(null);
      setError("Upload failed — check your connection.");
    };

    xhr.send(body);
  }

  const busy = progress !== null;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!busy && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-busy={busy}
        className={`flex min-h-[190px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-8 text-center transition ${
          dragging
            ? "border-[var(--admin-accent)] bg-[var(--admin-accent)]/5"
            : "border-slate-200 bg-white hover:border-slate-300"
        } ${busy ? "cursor-default" : "cursor-pointer"}`}
      >
        {tone === "video" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9 text-slate-700">
            <rect x="2" y="6" width="14" height="12" rx="2.5" />
            <path d="m17 10.5 4.2-2.6a.6.6 0 0 1 .9.5v7.2a.6.6 0 0 1-.9.5L17 13.5Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9 text-slate-700">
            <path d="M21 13.5V7a2.5 2.5 0 0 0-2.5-2.5H5.5A2.5 2.5 0 0 0 3 7v10a2.5 2.5 0 0 0 2.5 2.5H13" />
            <path d="m3.5 16 4.2-4.2a2 2 0 0 1 2.8 0L14 15" />
            <circle cx="9" cy="9" r="1.2" />
            <path d="M18 16v6M15 19h6" />
          </svg>
        )}

        <p className="mt-3 text-sm font-semibold text-slate-800">
          {busy ? `Uploading… ${progress}%` : label}
        </p>

        {busy ? (
          <div className="mt-3 w-full max-w-[220px]">
            <div
              role="progressbar"
              aria-valuenow={progress ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
            >
              <div
                className="h-full rounded-full bg-[var(--admin-accent)] transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-500">
            {hint}
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(e) => {
            if (e.target.files?.length) upload(e.target.files);
          }}
          onClick={(e) => e.stopPropagation()}
          className="sr-only"
        />
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
