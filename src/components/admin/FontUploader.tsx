"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, fieldInput, fieldSelect } from "./Field";

const WEIGHTS = [
  [100, "100 Thin"],
  [200, "200 Extra light"],
  [300, "300 Light"],
  [400, "400 Regular"],
  [500, "500 Medium"],
  [600, "600 Semi bold"],
  [700, "700 Bold"],
  [800, "800 Extra bold"],
  [900, "900 Black"],
] as const;

/*
 * Font upload with a real progress bar. XHR rather than fetch for the same
 * reason the product dropzone uses it: only an XHR reports bytes sent, and a
 * 2 MB font on a slow connection needs more feedback than a spinner.
 */
export function FontUploader({ families }: { families: string[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    setDone(null);
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/fonts");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      let body: { error?: string; family?: string; weight?: number } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        setDone(`${body.family} ${body.weight} uploaded.`);
        formRef.current?.reset();
        router.refresh();
      } else {
        setError(body.error ?? `Upload failed (${xhr.status}).`);
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Upload failed — check your connection.");
    };
    xhr.send(fd);
  }

  return (
    <form ref={formRef} onSubmit={upload} className="space-y-7">
      {error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {done}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
        <Field label="Font name" htmlFor="family">
          <input
            id="family"
            name="family"
            required
            list="known-families"
            placeholder="Satoshi"
            className={fieldInput}
          />
          {/* Typing an existing name adds a weight to that family rather than
              starting a second one. */}
          <datalist id="known-families">
            {families.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Field>

        <Field label="Weight" htmlFor="weight">
          <select id="weight" name="weight" defaultValue={400} className={fieldSelect}>
            {WEIGHTS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Style" htmlFor="style">
          <select id="style" name="style" defaultValue="normal" className={fieldSelect}>
            <option value="normal">Normal</option>
            <option value="italic">Italic</option>
          </select>
        </Field>

        <Field label="Font file" htmlFor="file">
          <input
            id="file"
            name="file"
            type="file"
            required
            accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
            className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-[var(--admin-btn)] file:px-4 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--admin-btn-ink)]"
          />
        </Field>
      </div>

      {progress !== null ? (
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[var(--admin-accent)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      <button
        type="submit"
        disabled={progress !== null}
        className="rounded-full bg-[var(--admin-btn)] px-6 py-2.5 text-sm font-semibold text-[var(--admin-btn-ink)] transition hover:bg-[var(--admin-btn)] disabled:opacity-60"
      >
        {progress !== null ? `Uploading ${progress}%` : "Upload font"}
      </button>
    </form>
  );
}
