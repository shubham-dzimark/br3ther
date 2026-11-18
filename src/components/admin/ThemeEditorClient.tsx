"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveThemeFile } from "@/app/admin/(protected)/content/theme/actions";
import { btnGhost, btnPrimary } from "./ui";

/*
 * The theme editor's client pieces: the code editor, the publish panel and the
 * image uploader. The editor is a plain textarea with a line-number gutter -
 * no editor library to ship or keep updated - plus the keys people expect:
 * Tab indents, Ctrl/Cmd+S saves.
 */

const mono = "font-[ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] text-[13px] leading-[20px]";

export function CodeEditor({
  name,
  initial,
  modified,
  readOnly = false,
}: {
  name: string;
  initial: string;
  modified: number;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [stamp, setStamp] = useState(modified);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const dirty = value !== saved;
  const lines = value.split("\n").length;

  const save = useCallback(() => {
    if (readOnly || !dirty || pending) return;
    start(async () => {
      const res = await saveThemeFile(name, value, stamp);
      if (res.ok) {
        setSaved(value);
        setStamp(res.modified);
        setNote({ tone: "ok", text: "Saved. Press Publish to put it on the shop." });
        router.refresh();
      } else {
        setNote({ tone: "error", text: res.error });
      }
    });
  }, [readOnly, dirty, pending, name, value, stamp, router]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
      return;
    }
    if (e.key === "Tab" && !readOnly) {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: a, selectionEnd: b } = el;
      const next = `${value.slice(0, a)}  ${value.slice(b)}`;
      setValue(next);
      requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--admin-line)] px-4 py-2.5">
        <span className={`${mono} truncate font-semibold text-slate-900`}>{name}</span>
        {readOnly ? (
          <span className="rounded-md bg-[var(--admin-inset)] px-2 py-0.5 text-xs text-slate-500">Older version, read only</span>
        ) : dirty ? (
          <span className="text-xs font-medium text-amber-700">Unsaved changes</span>
        ) : null}
        {note ? (
          <span className={`text-xs ${note.tone === "ok" ? "text-emerald-700" : "text-red-600"}`}>{note.text}</span>
        ) : null}
        {!readOnly ? (
          <div className="ml-auto flex gap-2">
            <button type="button" className={btnGhost} disabled={!dirty || pending} onClick={() => { setValue(saved); setNote(null); }}>
              Discard
            </button>
            <button type="button" className={btnPrimary} disabled={!dirty || pending} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        ) : null}
      </div>
      <div className="relative flex min-h-[560px] flex-1 overflow-hidden bg-[var(--admin-inset)]">
        <div
          ref={gutter}
          aria-hidden="true"
          className={`${mono} w-12 shrink-0 select-none overflow-hidden border-r border-[var(--admin-line)] py-3 pr-2 text-right text-slate-400`}
        >
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={area}
          value={value}
          readOnly={readOnly}
          onChange={(e) => { setValue(e.target.value); setNote(null); }}
          onKeyDown={onKey}
          onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          aria-label={`Contents of ${name}`}
          className={`${mono} absolute inset-y-0 left-12 right-0 resize-none overflow-auto whitespace-pre bg-transparent px-3 py-3 text-slate-800 outline-none`}
          style={{ tabSize: 2 }}
        />
      </div>
    </div>
  );
}

type Status = {
  state: "idle" | "queued" | "running" | "success" | "failed";
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  by?: string;
};

export function PublishPanel({
  initial,
  pendingCount,
  publish,
  back,
}: {
  initial: Status;
  /** Code files saved since the live build. */
  pendingCount: number;
  publish: (fd: FormData) => Promise<void>;
  back: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initial);
  const [log, setLog] = useState("");
  const [showLog, setShowLog] = useState(initial.state === "failed");
  const busy = status.state === "running" || status.state === "queued";
  const logBox = useRef<HTMLPreElement>(null);

  const poll = useCallback(async () => {
    const res = await fetch("/api/admin/theme/status", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { status: Status; log: string };
    setLog(data.log);
    setStatus((prev) => {
      if ((prev.state === "running" || prev.state === "queued") && data.status.state !== prev.state && data.status.state !== "running" && data.status.state !== "queued") {
        router.refresh();
        if (data.status.state === "failed") setShowLog(true);
      }
      return data.status;
    });
  }, [router]);

  useEffect(() => {
    if (showLog) void poll();
  }, [showLog, poll]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [busy, poll]);

  useEffect(() => {
    if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight;
  }, [log]);

  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");

  return (
    <div className="rounded-[var(--admin-radius)] border border-[var(--admin-line)] bg-[var(--admin-surface)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {busy
              ? status.state === "queued"
                ? "Publish requested, starting…"
                : "Publishing: rebuilding the shop (about 2–4 minutes)…"
              : pendingCount > 0
                ? `${pendingCount} saved file${pendingCount === 1 ? "" : "s"} not on the shop yet`
                : "The shop is up to date with the saved files"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {status.state === "success" && !busy ? `Last published ${when(status.finishedAt)}${status.by ? ` by ${status.by}` : ""}.` : null}
            {status.state === "failed" && !busy ? (
              <span className="text-red-600">Last publish failed {when(status.finishedAt)}: {status.message ?? "see the log"}. The shop kept running the previous version.</span>
            ) : null}
            {status.state === "idle" ? "Saving changes a file; Publish rebuilds the shop with every saved change." : null}
          </p>
        </div>
        <button type="button" className={btnGhost} onClick={() => setShowLog((v) => !v)}>
          {showLog ? "Hide log" : "Show log"}
        </button>
        <form action={publish} onSubmit={() => setStatus({ ...status, state: "queued" })}>
          <input type="hidden" name="back" value={back} />
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Publishing
              </>
            ) : (
              "Publish to store"
            )}
          </button>
        </form>
      </div>
      {busy ? (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--admin-inset)]">
          <div className="h-full w-1/3 animate-[themebar_1.4s_ease-in-out_infinite] rounded-full bg-[var(--admin-accent)]" />
        </div>
      ) : null}
      {showLog ? (
        <pre ref={logBox} className={`${mono} mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-[var(--admin-radius-sm)] bg-[var(--admin-inset)] p-3 text-[12px] text-slate-600`}>
          {log || "No publish has run yet."}
        </pre>
      ) : null}
      <style>{`@keyframes themebar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}

export function ImageUpload({ replace, label }: { replace?: string; label: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setState({ busy: true });
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("file", f);
    if (replace) fd.set("replace", replace);
    const res = await fetch("/api/admin/theme/upload", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setState({ busy: false, error: res.ok ? undefined : data.error ?? "Upload failed." });
    if (input.current) input.current.value = "";
    router.refresh();
  };

  return (
    <span className="inline-flex flex-col">
      <button type="button" className={replace ? `${btnGhost} !px-3 !py-1.5 !text-xs` : btnPrimary} disabled={state.busy} onClick={() => input.current?.click()}>
        {state.busy ? "Uploading…" : label}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml,image/x-icon,.ico"
        multiple={!replace}
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      {state.error ? <span className="mt-1 text-xs text-red-600">{state.error}</span> : null}
    </span>
  );
}
