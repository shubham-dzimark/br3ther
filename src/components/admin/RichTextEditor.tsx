"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Editor } from "ckeditor5";
import { rewriteText } from "@/app/admin/(protected)/products/ai-actions";
import type { RewriteMode } from "@/lib/ai-write";

/**
 * Every editor in the admin: CKEditor 5 with the shop's own extras around it.
 *
 * CKEditor supplies the writing surface, the toolbar and the source view. The
 * strip below it is ours and is the reason this wrapper exists: rewriting with
 * AI, inserting a picture from the media library, and pasting formatting-free
 * text - three things the shop had before and would otherwise lose.
 *
 * The surface loads in the browser only. CKEditor reaches for the DOM while it
 * is being imported, so a server render cannot run it.
 *
 * Nothing typed here is trusted: whatever arrives - typed, pasted, or written
 * in the source view - is sanitised on the server before it is stored. See
 * lib/rich-text.ts.
 */

const Surface = dynamic(() => import("@/components/admin/CkEditorSurface"), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-6 text-sm text-slate-400">
      Loading editor…
    </div>
  ),
});

type Props = {
  /**
   * Posts the value under this name. Leave it out when the editor sits inside
   * a bigger field that submits the value itself - a spec-table row, say -
   * and read the value through `onChange` instead.
   */
  name?: string;
  initialHtml: string;
  placeholder?: string;
  /** Short descriptions get inline formatting only - no blocks or alignment. */
  compact?: boolean;
  minHeight?: number;
  /** Called with the current HTML whenever it changes. */
  onChange?: (html: string) => void;
};

const MODES: { mode: RewriteMode; label: string }[] = [
  { mode: "improve", label: "Improve writing" },
  { mode: "shorten", label: "Make shorter" },
  { mode: "expand", label: "Make longer" },
  { mode: "fix", label: "Fix spelling & grammar" },
];

type Asset = { id: string; url: string; filename: string };

export function RichTextEditor({
  name,
  initialHtml,
  placeholder = "Write here…",
  compact = false,
  minHeight = 220,
  onChange,
}: Props) {
  const editorRef = useRef<Editor | null>(null);
  /*
   * The editor weighs about 280KB and every field on a screen loads its own
   * copy of the engine. A product page carries four of them, so opening a
   * product meant waiting for all of that before anything could be typed -
   * even to change a price. Nothing is fetched until a field is used: until
   * then the field shows what it holds, and the value posts from the hidden
   * input either way.
   */
  const [live, setLive] = useState(false);
  const [html, setHtml] = useState(initialHtml);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [menu, setMenu] = useState<"ai" | "media" | null>(null);
  const [media, setMedia] = useState<Asset[] | null>(null);
  const [pasteAsText, setPasteAsText] = useState(false);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const commit = useCallback((next: string) => {
    setHtml(next);
    onChangeRef.current?.(next);
  }, []);

  /*
   * "Paste as plain text" while the toggle is on. CKEditor pastes formatting
   * by default and offers Ctrl+Shift+V for the plain version; the toggle is
   * for a run of pastes out of a document whose markup is a mess.
   */
  const plainRef = useRef(pasteAsText);
  plainRef.current = pasteAsText;
  const attachPasteRule = useCallback((editor: Editor) => {
    const pipeline = editor.plugins.has("ClipboardPipeline")
      ? editor.plugins.get("ClipboardPipeline")
      : null;
    if (!pipeline) return;
    pipeline.on(
      "inputTransformation",
      (_evt, data: { content: unknown; dataTransfer: { getData: (t: string) => string } }) => {
        if (!plainRef.current) return;
        const text = data.dataTransfer.getData("text/plain");
        if (!text) return;
        data.content = editor.data.processor.toView(
          text
            .split(/\n{2,}/)
            .map((para) => `<p>${escapeHtml(para.replace(/\n/g, " ").trim())}</p>`)
            .filter((p) => p !== "<p></p>")
            .join("") || "<p></p>",
        );
      },
      { priority: "high" },
    );
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest?.("[data-editor-menu]")) setMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  async function openMedia() {
    setMenu(menu === "media" ? null : "media");
    if (media) return;
    try {
      const res = await fetch("/api/admin/media?kind=image", { cache: "no-store" });
      const data = (await res.json()) as { assets?: Asset[] };
      setMedia(data.assets ?? []);
    } catch {
      setMedia([]);
      setNote("Could not load the media library.");
    }
  }

  function insertImage(url: string) {
    const editor = editorRef.current;
    if (!editor) return;
    setMenu(null);
    if (editor.commands.get("insertImage")) {
      editor.execute("insertImage", { source: url });
    } else {
      // A compact field has no image plugin; a link to the file is the most it can hold.
      editor.execute("insertText", { text: url });
    }
    commit(editor.getData());
    editor.editing.view.focus();
  }

  async function ai(mode: RewriteMode) {
    const editor = editorRef.current;
    if (!editor) return;
    setMenu(null);

    const selection = editor.model.document.selection;
    const hasSelection = !selection.isCollapsed;
    const domRoot = editor.editing.view.getDomRoot();
    const whole = (domRoot?.innerText ?? "").trim();
    const selected = hasSelection ? (window.getSelection()?.toString() ?? "").trim() : "";
    const source = selected || whole;

    if (source.length < 10) {
      setNote("Write a little more first, or select the part to change.");
      return;
    }

    setBusy(true);
    setNote(null);
    const result = await rewriteText(source, mode);
    setBusy(false);

    if (!result.ok) {
      setNote(result.error);
      return;
    }

    if (selected) {
      // Inserted as text, so the model's output can never carry markup of its own.
      editor.model.change((writer) => {
        editor.model.insertContent(writer.createText(result.text));
      });
      setNote("Replaced the selected text.");
    } else {
      editor.setData(
        result.text
          .split(/\n{2,}/)
          .map((para) => `<p>${escapeHtml(para.replace(/\n/g, " ").trim())}</p>`)
          .filter((p) => p !== "<p></p>")
          .join(""),
      );
      setNote("Rewrote the description.");
    }
    commit(editor.getData());
  }

  const tool =
    "rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200/70 hover:text-slate-900";

  return (
    <div>
      {name ? <input type="hidden" name={name} value={html} readOnly /> : null}

      {live ? (
        <Surface
          initialHtml={html}
          placeholder={placeholder}
          compact={compact}
          minHeight={minHeight}
          onChange={commit}
          onReady={(editor) => {
            editorRef.current = editor;
            if (editor) {
              attachPasteRule(editor);
              // The click that woke it should land in the text.
              editor.editing.view.focus();
            }
          }}
        />
      ) : (
        <div
          role="textbox"
          tabIndex={0}
          aria-label={`${placeholder} - click to edit`}
          onFocus={() => setLive(true)}
          onClick={() => setLive(true)}
          className="nl-ck-idle cursor-text rounded-2xl border border-slate-200 bg-white transition focus:border-[var(--admin-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/15"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            Click to edit
          </div>
          {html.trim() ? (
            <div
              className="ck-content px-4 py-3 text-sm leading-relaxed text-slate-800"
              style={{ minHeight }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <div className="px-4 py-3 text-sm text-slate-400" style={{ minHeight }}>
              {placeholder}
            </div>
          )}
        </div>
      )}

      {/* The shop's own tools, under CKEditor's own toolbar. They act on the
          editor, so they appear with it. */}
      <div className={`mt-2 flex-wrap items-center gap-2 text-[11px] text-slate-500 ${live ? "flex" : "hidden"}`}>
        <div className="relative" data-editor-menu>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMenu(menu === "ai" ? null : "ai")}
            className={`${tool} border border-slate-200 disabled:opacity-60`}
          >
            {busy ? "Writing…" : "✦ Rewrite with AI"}
          </button>
          {menu === "ai" ? (
            <div className="absolute left-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              {MODES.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => void ai(m.mode)}
                  className="block w-full px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-50"
                >
                  {m.label}
                </button>
              ))}
              <p className="border-t border-slate-100 px-3 py-2 text-[10px] leading-relaxed text-slate-400">
                Select text to change part of it, or leave nothing selected to
                rewrite the whole thing.
              </p>
            </div>
          ) : null}
        </div>

        {!compact ? (
          <div className="relative" data-editor-menu>
            <button
              type="button"
              onClick={() => void openMedia()}
              className={`${tool} border border-slate-200`}
            >
              Add media
            </button>
            {menu === "media" ? (
              <div className="absolute left-0 z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                {media === null ? (
                  <p className="px-2 py-3 text-xs text-slate-400">Loading…</p>
                ) : media.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-slate-400">No images uploaded yet.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {media.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => insertImage(a.url)}
                        title={a.filename}
                        className="aspect-square overflow-hidden rounded-lg border border-slate-200 transition hover:border-[var(--admin-accent)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setPasteAsText((v) => !v)}
          aria-pressed={pasteAsText}
          title="Paste as plain text - use when the source formatting is a mess"
          className={`${tool} border ${
            pasteAsText
              ? "border-slate-900 bg-slate-900 text-[var(--on-colour)] hover:bg-slate-900 hover:text-[var(--on-colour)]"
              : "border-slate-200"
          }`}
        >
          Paste as plain text
        </button>

        {note ? <span className="text-slate-600">{note}</span> : null}
      </div>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
