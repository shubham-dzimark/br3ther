"use client";

import { useEffect, useMemo, useState } from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import {
  Alignment,
  Autoformat,
  AutoLink,
  BlockQuote,
  Bold,
  ClassicEditor,
  Essentials,
  FontBackgroundColor,
  FontColor,
  FontFamily,
  FontSize,
  GeneralHtmlSupport,
  Heading,
  HorizontalLine,
  Image,
  ImageCaption,
  ImageInsertViaUrl,
  ImageResize,
  ImageStyle,
  ImageTextAlternative,
  ImageToolbar,
  Indent,
  Italic,
  Link,
  List,
  Paragraph,
  PasteFromOffice,
  RemoveFormat,
  SourceEditing,
  Strikethrough,
  Table,
  TableCaption,
  TableColumnResize,
  TableToolbar,
  Underline,
  WordCount,
  type Editor,
} from "ckeditor5";
import "ckeditor5/ckeditor5.css";

/*
 * CKEditor 5, the writing surface behind every editor in the admin.
 *
 * Loaded only in the browser (see RichTextEditor): CKEditor touches the DOM
 * as it is imported, which a server render cannot give it.
 *
 * Two things carried over from the editor this replaced:
 *  - "Source" is CKEditor's own source-editing view, so HTML can still be
 *    pasted in wholesale;
 *  - nothing typed here is trusted. Whatever arrives is sanitised on the
 *    server before it is stored - see lib/rich-text.ts. This is a writing
 *    surface, not a security boundary.
 *
 * `compact` is for short fields - a card blurb, a spec-table cell - where a
 * heading or a bullet list would break the layout, and where the server's
 * short-text allowlist drops block structure anyway.
 */

/** The free build asks for this; a commercial key from CKEditor drops in here. */
const LICENSE_KEY = "GPL";

const FULL_TOOLBAR = [
  "undo",
  "redo",
  "|",
  "heading",
  "|",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "|",
  "fontFamily",
  "fontSize",
  "fontColor",
  "fontBackgroundColor",
  "|",
  "alignment",
  "bulletedList",
  "numberedList",
  "outdent",
  "indent",
  "|",
  "link",
  "blockQuote",
  "insertTable",
  "insertImageViaUrl",
  "horizontalLine",
  "|",
  "removeFormat",
  "sourceEditing",
];

const COMPACT_TOOLBAR = [
  "undo",
  "redo",
  "|",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "|",
  "link",
  "removeFormat",
  "sourceEditing",
];

export default function CkEditorSurface({
  initialHtml,
  placeholder,
  compact = false,
  minHeight = 220,
  onChange,
  onReady,
}: {
  initialHtml: string;
  placeholder?: string;
  compact?: boolean;
  minHeight?: number;
  onChange?: (html: string) => void;
  onReady?: (editor: Editor | null) => void;
}) {
  const [words, setWords] = useState(0);

  const config = useMemo(
    () => ({
      licenseKey: LICENSE_KEY,
      placeholder,
      plugins: compact
        ? [Essentials, Paragraph, Bold, Italic, Underline, Strikethrough, Link, AutoLink, RemoveFormat, SourceEditing, PasteFromOffice, GeneralHtmlSupport]
        : [
            Essentials,
            Paragraph,
            Heading,
            Bold,
            Italic,
            Underline,
            Strikethrough,
            FontFamily,
            FontSize,
            FontColor,
            FontBackgroundColor,
            Alignment,
            List,
            Indent,
            Link,
            AutoLink,
            BlockQuote,
            HorizontalLine,
            Image,
            ImageToolbar,
            ImageCaption,
            ImageStyle,
            ImageResize,
            ImageTextAlternative,
            ImageInsertViaUrl,
            Table,
            TableToolbar,
            TableColumnResize,
            TableCaption,
            RemoveFormat,
            SourceEditing,
            Autoformat,
            PasteFromOffice,
            WordCount,
            GeneralHtmlSupport,
          ],
      toolbar: { items: compact ? COMPACT_TOOLBAR : FULL_TOOLBAR, shouldNotGroupWhenFull: false },
      /*
       * A paragraph on its own line in a short field would be stripped by the
       * server anyway, so compact fields stay inline.
       */
      ...(compact
        ? {}
        : {
            heading: {
              options: [
                { model: "paragraph" as const, title: "Paragraph", class: "ck-heading_paragraph" },
                { model: "heading2" as const, view: "h2", title: "Heading", class: "ck-heading_heading2" },
                { model: "heading3" as const, view: "h3", title: "Subheading", class: "ck-heading_heading3" },
              ],
            },
            table: {
              contentToolbar: ["tableColumn", "tableRow", "mergeTableCells", "toggleTableCaption"],
            },
            image: {
              toolbar: [
                "imageStyle:inline",
                "imageStyle:block",
                "imageStyle:side",
                "|",
                "toggleImageCaption",
                "imageTextAlternative",
                "|",
                "resizeImage",
              ],
            },
          }),
      fontFamily: {
        options: [
          "default",
          "Inter, system-ui, sans-serif",
          "Georgia, serif",
          "'Times New Roman', serif",
          "'Courier New', monospace",
          "Arial, Helvetica, sans-serif",
        ],
        supportAllValues: true,
      },
      fontSize: { options: [12, 14, 16, 18, 20, 24, 30, 36], supportAllValues: true },
      /*
       * Hex, not the editor's default hsl(): the server stores what the
       * allowlist recognises, and hex is what every other colour in the admin
       * is written in.
       */
      fontColor: { colorPicker: { format: "hex" as const } },
      fontBackgroundColor: { colorPicker: { format: "hex" as const } },
      link: {
        defaultProtocol: "https://",
        addTargetToExternalLinks: false,
        decorators: {
          openInNewTab: {
            mode: "manual" as const,
            label: "Open in a new tab",
            attributes: { target: "_blank", rel: "noopener noreferrer" },
          },
        },
      },
      /*
       * The server decides what markup may be stored. Allowing style and class
       * through here keeps a pasted table or a coloured span intact up to the
       * point the sanitiser rules on it, instead of the editor quietly
       * dropping what the shop just pasted.
       */
      htmlSupport: {
        allow: [
          {
            name: /^(p|span|div|table|thead|tbody|tr|th|td|ul|ol|li|h[2-6]|a|strong|em|u|s|br|hr|blockquote|figure|figcaption)$/,
            attributes: [/.*/],
            classes: [/.*/],
            styles: [/.*/],
          },
        ],
      },
    }),
    [compact, placeholder],
  );

  // The editable's height is set in CSS, which CKEditor owns; a variable on the
  // wrapper is the supported way in.
  useEffect(() => {
    document.documentElement.style.setProperty("--ck-min-height-fallback", `${minHeight}px`);
  }, [minHeight]);

  return (
    <div
      className="nl-ck overflow-hidden rounded-2xl border border-slate-200 bg-white"
      style={{ ["--nl-ck-min-height" as string]: `${minHeight}px` }}
    >
      <CKEditor
        editor={ClassicEditor}
        config={config}
        data={initialHtml}
        onReady={(editor) => {
          onReady?.(editor);
          const wc = editor.plugins.has("WordCount") ? editor.plugins.get("WordCount") : null;
          if (wc) {
            setWords(wc.words);
            wc.on("update", (_evt, stats: { words: number }) => setWords(stats.words));
          }
        }}
        onAfterDestroy={() => onReady?.(null)}
        onChange={(_event, editor) => onChange?.(editor.getData())}
      />
      {!compact ? (
        <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50/70 px-3 py-1.5 text-[11px] text-slate-400">
          Word count: {words}
        </div>
      ) : null}
    </div>
  );
}
