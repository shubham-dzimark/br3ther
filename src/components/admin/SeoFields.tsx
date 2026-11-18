"use client";

import { SITE_HOST } from "@/lib/site";
import { useMemo, useRef, useState } from "react";
import { generateSeo } from "@/app/admin/(protected)/seo-actions";
import {
  SEO_LIMITS,
  SEO_VARIABLES,
  expandSeo,
  scoreSeo,
  type SeoContext,
} from "@/lib/seo-vars";

/**
 * Search-engine title, slug and meta description, with variables, a length
 * meter, an AI draft button and a preview of the result.
 *
 * The meter and the preview run the same expansion the page itself uses, so
 * what is shown here is what a search engine gets - a preview that disagreed
 * with the real page would be worse than no preview.
 */

type Props = {
  /** Field names, so this drops into whichever form it is placed in. */
  titleName?: string;
  descriptionName?: string;
  slugName?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  defaultSlug?: string;
  /** Real values behind the variables, for the meter and the preview. */
  context: SeoContext;
  /** What the AI is told it is writing about. */
  subject: string;
  /** Shown under the slug, e.g. "br3thr.com/shop?category=". */
  urlPrefix?: string;
  showSlug?: boolean;
  /**
   * When the card sits outside the <form> it belongs to - as on the product
   * edit page - the inputs join it by id instead of by nesting.
   */
  formId?: string;
};

const TONE = {
  empty: "bg-slate-200",
  short: "bg-amber-400",
  good: "bg-emerald-500",
  long: "bg-orange-500",
} as const;

const ADVICE = {
  empty: "Empty — search engines will invent one from the page.",
  short: "A little short. There is room to say more.",
  good: "Good length.",
  long: "Longer than search results show; the end will be cut off.",
} as const;

export function SeoFields({
  titleName = "seoTitle",
  descriptionName = "seoDescription",
  slugName = "slug",
  defaultTitle = "",
  defaultDescription = "",
  defaultSlug = "",
  context,
  subject,
  urlPrefix = "",
  showSlug = false,
  formId,
}: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [slug, setSlug] = useState(defaultSlug);
  const [busy, setBusy] = useState<null | "seoTitle" | "seoDescription">(null);
  const [menu, setMenu] = useState<null | "title" | "description">(null);
  const [note, setNote] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // What a search engine will actually show, variables resolved.
  const shownTitle = useMemo(() => expandSeo(title, context), [title, context]);
  const shownDesc = useMemo(() => expandSeo(description, context), [description, context]);
  const titleScore = scoreSeo(shownTitle, "title");
  const descScore = scoreSeo(shownDesc, "description");

  /** Drop a variable in at the cursor rather than at the end. */
  function insert(which: "title" | "description", token: string) {
    setMenu(null);
    const el = which === "title" ? titleRef.current : descRef.current;
    const current = which === "title" ? title : description;
    const at = el?.selectionStart ?? current.length;
    const next = `${current.slice(0, at)}${token}${current.slice(el?.selectionEnd ?? at)}`;
    if (which === "title") setTitle(next);
    else setDescription(next);
    // Put the caret after what was just inserted.
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    }, 0);
  }

  async function draft(kind: "seoTitle" | "seoDescription") {
    setBusy(kind);
    setNote(null);
    const result = await generateSeo(kind, subject);
    setBusy(null);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    if (kind === "seoTitle") setTitle(result.text);
    else setDescription(result.text);
  }

  const chip =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]";

  const Meter = ({ score, kind }: { score: ReturnType<typeof scoreSeo>; kind: "title" | "description" }) => (
    <div className="mt-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${TONE[score.tone]}`}
          style={{ width: `${Math.max(score.percent, score.tone === "empty" ? 0 : 6)}%` }}
        />
      </div>
      <p className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
        <span>{ADVICE[score.tone]}</span>
        <span className="tabular-nums">
          {(kind === "title" ? shownTitle : shownDesc).length}/{SEO_LIMITS[kind].best}
        </span>
      </p>
    </div>
  );

  const VariableMenu = ({ which }: { which: "title" | "description" }) => (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setMenu(menu === which ? null : which)}
        className={chip}
      >
        Insert variable
      </button>
      {menu === which ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {SEO_VARIABLES.map((v) => (
            <button
              key={v.token}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(which, v.token)}
              className="block w-full px-3 py-1.5 text-left transition hover:bg-slate-50"
            >
              <span className="block text-xs font-semibold text-slate-800">{v.label}</span>
              <span className="block text-[11px] text-slate-400">{v.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ---- SEO title ---- */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={titleName} className="text-sm font-medium text-slate-700">
            SEO title
          </label>
          <div className="flex items-center gap-2">
            <VariableMenu which="title" />
            <button
              type="button"
              onClick={() => void draft("seoTitle")}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--admin-btn)] px-2.5 py-1 text-xs font-semibold text-[var(--admin-btn-ink)] transition hover:brightness-110 disabled:opacity-60"
            >
              <Sparkle />
              {busy === "seoTitle" ? "Writing…" : "Generate"}
            </button>
          </div>
        </div>
        <input
          ref={titleRef}
          id={titleName}
          name={titleName}
          form={formId}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="%%title%% %%sep%% %%sitename%%"
          className="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/15"
        />
        <Meter score={titleScore} kind="title" />
      </div>

      {showSlug ? (
        <div>
          <label htmlFor={slugName} className="mb-1.5 block text-sm font-medium text-slate-700">
            Slug
          </label>
          <input
            id={slugName}
            name={slugName}
            form={formId}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/15"
          />
          {urlPrefix ? (
            <p className="mt-1.5 px-1 text-[11px] text-slate-400">
              {urlPrefix}
              <span className="font-medium text-slate-600">{slug || "…"}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ---- Meta description ---- */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={descriptionName} className="text-sm font-medium text-slate-700">
            Meta description
          </label>
          <div className="flex items-center gap-2">
            <VariableMenu which="description" />
            <button
              type="button"
              onClick={() => void draft("seoDescription")}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--admin-btn)] px-2.5 py-1 text-xs font-semibold text-[var(--admin-btn-ink)] transition hover:brightness-110 disabled:opacity-60"
            >
              <Sparkle />
              {busy === "seoDescription" ? "Writing…" : "Generate"}
            </button>
          </div>
        </div>
        <textarea
          ref={descRef}
          id={descriptionName}
          name={descriptionName}
          form={formId}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One or two sentences describing this page."
          className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm text-slate-900 outline-none transition focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/15"
        />
        <Meter score={descScore} kind="description" />
      </div>

      {note ? <p className="text-xs text-red-600">{note}</p> : null}

      {/* ---- What Google will show ---- */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Search result preview
        </p>
        {/*
          Joined rather than concatenated. A prefix that is a bare host
          ("br3thr.com") carries no trailing slash, so gluing the slug straight
          on produced "br3thr.comhome" in the preview; a prefix that is a path
          ("br3thr.com/products/") already ends in one and must not gain a
          second. Normalise both ends and insert exactly one.
        */}
        {/* Neutral, the way Google actually renders a result URL. It was
            emerald, which put a green line in a panel that has no other green
            and turned bright mint under the dark scheme's status overrides. */}
        <p className="truncate text-[13px] text-slate-500">
          {(() => {
            const host = (urlPrefix || SITE_HOST).replace(/\/+$/, "");
            if (!showSlug) return host;
            const tail = String(slug ?? "").replace(/^\/+/, "");
            return tail ? `${host}/${tail}` : host;
          })()}
        </p>
        {/* Google's own link blue. Hardcoded on purpose - this block is a
            facsimile of a search result, not part of the admin's palette - but
            #1a0dab is near-black on a dark panel, so the dark scheme swaps in
            the shade Google itself uses on dark backgrounds. */}
        <p className="mt-0.5 truncate text-lg leading-snug text-[#1a0dab] [[data-scheme='dark']_&]:text-[#8ab4f8]">
          {shownTitle || context.title || "Untitled page"}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-slate-600">
          {shownDesc || "No description — search engines will pick their own text from the page."}
        </p>
      </div>
    </div>
  );
}

function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="m12 3 1.9 4.1L18 9l-4.1 1.9L12 15l-1.9-4.1L6 9l4.1-1.9Z" />
      <path d="M18 14.5 19 17l2.5 1L19 19l-1 2.5L17 19l-2.5-1 2.5-1Z" />
    </svg>
  );
}
