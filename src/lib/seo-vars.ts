/**
 * Variables for SEO titles and meta descriptions.
 *
 * Stored as written - "%%term_title%% | %%sitename%%" - and expanded when the
 * page renders. That way renaming the shop, or a category, updates every title
 * that mentions it instead of leaving dozens of hand-typed copies to find.
 *
 * No "server-only": the admin previews the same expansion in the browser, and
 * a preview that disagreed with the real page would be worse than none.
 */

export type SeoVariable = {
  token: string;
  label: string;
  hint: string;
};

/** Offered by the "Insert variable" menu, in this order. */
export const SEO_VARIABLES: SeoVariable[] = [
  { token: "%%title%%", label: "Title", hint: "The product, category or post name" },
  { token: "%%sitename%%", label: "Site title", hint: "Your shop's name" },
  { token: "%%sep%%", label: "Separator", hint: "The divider between parts" },
  { token: "%%category%%", label: "Category", hint: "The item's category, where it has one" },
  { token: "%%excerpt%%", label: "Excerpt", hint: "The short description" },
  { token: "%%price%%", label: "Price", hint: "Products only" },
  { token: "%%page%%", label: "Page", hint: "\"Page 2 of 7\" on listings" },
];

export type SeoContext = {
  title?: string;
  sitename?: string;
  sep?: string;
  category?: string;
  excerpt?: string;
  price?: string;
  page?: string;
};

/**
 * Replace every %%variable%% with its value.
 *
 * A variable with nothing to fill it collapses along with the separator
 * around it, so a product with no category never renders "Shirt |  | Shop"
 * with a gap where the category should have been.
 */
export function expandSeo(template: string, ctx: SeoContext): string {
  if (!template) return "";

  const values: Record<string, string> = {
    "%%title%%": ctx.title ?? "",
    "%%sitename%%": ctx.sitename ?? "",
    "%%sep%%": ctx.sep ?? "|",
    "%%category%%": ctx.category ?? "",
    "%%excerpt%%": ctx.excerpt ?? "",
    "%%price%%": ctx.price ?? "",
    "%%page%%": ctx.page ?? "",
  };

  let out = template;
  for (const [token, value] of Object.entries(values)) {
    out = out.split(token).join(value);
  }

  return tidy(out);
}

/** Clear up the gaps an empty variable leaves behind. */
export function tidy(text: string): string {
  return text
    .replace(/\s+/g, " ")
    // A separator with nothing on one side of it.
    .replace(/^\s*[|\-–—·]\s*/, "")
    .replace(/\s*[|\-–—·]\s*$/, "")
    // Two separators that have collapsed together.
    .replace(/\s*([|\-–—·])\s*(?:\1\s*)+/g, " $1 ")
    .trim();
}

/**
 * How well a title or description fits what search engines show.
 *
 * Google measures pixels, not characters, so these are the usual working
 * approximations rather than hard limits - which is why "too long" is amber
 * rather than red: it still works, it may just be trimmed.
 */
export const SEO_LIMITS = {
  title: { good: 30, best: 60, max: 70 },
  description: { good: 70, best: 155, max: 165 },
} as const;

export type SeoScore = { tone: "empty" | "short" | "good" | "long"; percent: number };

export function scoreSeo(text: string, kind: "title" | "description"): SeoScore {
  const limits = SEO_LIMITS[kind];
  const n = text.trim().length;
  const percent = Math.min(100, Math.round((n / limits.best) * 100));

  if (n === 0) return { tone: "empty", percent: 0 };
  if (n < limits.good) return { tone: "short", percent };
  if (n <= limits.max) return { tone: "good", percent };
  return { tone: "long", percent: 100 };
}
