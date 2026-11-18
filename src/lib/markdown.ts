import { sanitizeRichText, richTextToPlain } from "@/lib/rich-text";

/**
 * A small Markdown subset for blog posts and page bodies.
 *
 * Deliberately escape-first: every character is HTML-escaped before any
 * markup is produced, so nothing an author types - or pastes from somewhere
 * else - can inject a tag or a script. That costs raw-HTML support, which
 * WordPress allows, and buys immunity to stored XSS from any account that can
 * write a post. Links are additionally restricted to http(s), mailto and
 * site-relative paths, so "javascript:" can't ride in through a link.
 *
 * Supported: # to ###### headings, **bold**, *italic*, `code`, fenced code
 * blocks, > quotes, - and 1. lists, [text](url), ![alt](src), --- rules,
 * and blank-line-separated paragraphs with single newlines as <br>.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only schemes that cannot execute script. Anything else becomes "#". */
function safeUrl(raw: string): string {
  const url = raw.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return url;
  if (/^[/#]/.test(url)) return url;
  return "#";
}

/** Inline markup, applied to already-escaped text. */
function inline(text: string): string {
  let out = text;

  // Images before links: both start with "[" once the "!" is consumed.
  out = out.replace(
    /!\[([^\]]*)\]\(([^)\s]+)\)/g,
    (_m, alt: string, src: string) =>
      `<img src="${safeUrl(src)}" alt="${alt}" loading="lazy" class="my-6 h-auto w-full rounded-xl" />`,
  );

  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, href: string) => {
      const url = safeUrl(href);
      const external = /^https?:\/\//i.test(url);
      return `<a href="${url}"${
        external ? ' target="_blank" rel="noopener noreferrer"' : ""
      } class="font-medium text-[var(--brand-dark)] underline underline-offset-2">${label}</a>`;
    },
  );

  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em]">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Single asterisks last, so ** has already been consumed.
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  return out;
}

export function renderMarkdown(source: string): string {
  if (!source?.trim()) return "";

  const text = escapeHtml(source).replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const html: string[] = [];

  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let inFence = false;
  let fence: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inline(paragraph.join("\n")).replace(/\n/g, "<br />")}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const line of lines) {
    // Fenced code: taken verbatim, no inline markup applied inside.
    if (/^```/.test(line)) {
      if (inFence) {
        html.push(
          `<pre class="my-6 overflow-x-auto rounded-xl bg-slate-900 p-4 text-sm text-slate-100"><code>${fence.join("\n")}</code></pre>`,
        );
        fence = [];
        inFence = false;
      } else {
        flushParagraph();
        closeList();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fence.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      const sizes = ["text-3xl", "text-2xl", "text-xl", "text-lg", "text-base", "text-base"];
      html.push(
        `<h${level} class="mt-10 mb-3 ${sizes[level - 1]} font-semibold tracking-tight text-slate-900">${inline(heading[2])}</h${level}>`,
      );
      continue;
    }

    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      flushParagraph();
      closeList();
      html.push('<hr class="my-10 border-slate-200" />');
      continue;
    }

    const quote = /^&gt;\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(
        `<blockquote class="my-6 border-l-4 border-[var(--brand-highlight)] bg-slate-50 py-3 pl-5 pr-4 italic text-slate-700">${inline(quote[1])}</blockquote>`,
      );
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const want: "ul" | "ol" = bullet ? "ul" : "ol";
      if (listType !== want) {
        closeList();
        html.push(
          want === "ul"
            ? '<ul class="my-5 list-disc space-y-2 pl-6">'
            : '<ol class="my-5 list-decimal space-y-2 pl-6">',
        );
        listType = want;
      }
      html.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(line);
  }

  if (inFence && fence.length) {
    html.push(
      `<pre class="my-6 overflow-x-auto rounded-xl bg-slate-900 p-4 text-sm text-slate-100"><code>${fence.join("\n")}</code></pre>`,
    );
  }
  flushParagraph();
  closeList();

  return html.join("\n");
}

/** First N characters of the prose, for excerpts and meta descriptions. */
export function plainExcerpt(source: string, limit = 180): string {
  const flat = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*`_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit).replace(/\s+\S*$/, "")}…`;
}

/** "5 min read", the way every blog does it. 200 wpm is the usual figure. */
export function readingMinutes(source: string): number {
  const words = source.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * Body written by the rich text editor, rendered for the storefront.
 *
 * Blog posts and content pages used to be Markdown (and, for pages, plain
 * text). Everything written from now on is HTML from the editor, but archives
 * still hold the old format - so a body with no block markup is run through
 * the Markdown renderer first, and only then sanitised. Nothing has to be
 * migrated, and an old post keeps rendering exactly as it did.
 */
export function bodyToHtml(body: string): string {
  const source = body ?? "";
  if (!source.trim()) return "";
  const looksLikeHtml =
    /<(p|div|h[1-6]|ul|ol|li|table|img|figure|blockquote|pre|br|strong|em|span|a)\b/i.test(
      source,
    );
  return looksLikeHtml ? sanitizeRichText(source) : renderMarkdown(source);
}

/**
 * Plain text from either format, for excerpts and reading time.
 *
 * An old Markdown body goes through plainExcerpt, which strips the syntax -
 * returning it raw would put "# Heading" and "**bold**" straight onto the
 * blog index.
 */
export function bodyToPlain(body: string, limit?: number): string {
  const source = body ?? "";
  if (!source.trim()) return "";
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(source);
  if (!looksLikeHtml) return plainExcerpt(source, limit ?? 100_000);

  const text = richTextToPlain(source);
  if (limit == null) return text;
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}
