"use client";

import { useEffect, useRef, useState } from "react";

const MAX = 4;
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Images on a staff reply: an "Attach image" button and paste-a-screenshot
 * into the reply box (the textarea with id `textareaId`). The files ride in
 * the form's own `images` input, so the server action receives them with the
 * text - no separate upload step for staff.
 */
export function ReplyAttachments({ textareaId }: { textareaId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Keep the real <input type=file> in step with what is shown.
  useEffect(() => {
    if (!inputRef.current) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    inputRef.current.files = dt.files;
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function add(list: File[]) {
    const images = list.filter((f) => f.type.startsWith("image/") && f.type !== "image/svg+xml");
    if (images.some((f) => f.size > MAX_BYTES)) {
      setError("Each image must be under 5 MB.");
      return;
    }
    setError(null);
    setFiles((cur) => [...cur, ...images].slice(0, MAX));
  }

  // Paste a screenshot straight into the reply box.
  useEffect(() => {
    const box = document.getElementById(textareaId);
    if (!box) return;
    const onPaste = (e: ClipboardEvent) => {
      const pasted = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (pasted.length) {
        e.preventDefault();
        add(pasted);
      }
    };
    box.addEventListener("paste", onPaste);
    return () => box.removeEventListener("paste", onPaste);
  }, [textareaId]);

  return (
    <div className="space-y-2">
      {/* The input the form submits; filled by the button, paste or both. */}
      <input ref={inputRef} type="file" name="images" multiple accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" />
      <input
        id={`${textareaId}-pick`}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          add([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={`${textareaId}-pick`}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[#0E7C66] hover:text-[#0E7C66]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="m21.4 11.6-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8" />
          </svg>
          Attach image
        </label>
        <span className="text-xs text-slate-400">or paste a screenshot into the box · up to {MAX}, 5 MB each</span>
      </div>

      {previews.length ? (
        <div className="flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <div key={src} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-20 w-20 rounded-xl border border-slate-200 object-cover" />
              <button
                type="button"
                aria-label="Remove image"
                onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-xs text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
