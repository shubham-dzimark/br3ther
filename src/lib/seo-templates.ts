import "server-only";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { expandSeo, tidy, type SeoContext } from "@/lib/seo-vars";

/*
 * Default search appearance, per content type.
 *
 * The Yoast arrangement: one template per type that every item of that type
 * uses, and a per-item override for the handful that need their own wording.
 * Before this, an item with no SEO fields simply fell back to its own name -
 * so a shop had to write a title for every product to get "Name | Shop" in
 * search results.
 */

export type SeoType =
  | "product"
  | "category"
  | "post"
  | "blogCategory"
  | "page";

type TemplateKeys = { title: string; description: string };

const KEYS: Record<SeoType, TemplateKeys> = {
  product: {
    title: SETTING_KEYS.seoTplProductTitle,
    description: SETTING_KEYS.seoTplProductDescription,
  },
  category: {
    title: SETTING_KEYS.seoTplCategoryTitle,
    description: SETTING_KEYS.seoTplCategoryDescription,
  },
  post: {
    title: SETTING_KEYS.seoTplPostTitle,
    description: SETTING_KEYS.seoTplPostDescription,
  },
  blogCategory: {
    title: SETTING_KEYS.seoTplBlogCategoryTitle,
    description: SETTING_KEYS.seoTplBlogCategoryDescription,
  },
  page: {
    title: SETTING_KEYS.seoTplPageTitle,
    description: SETTING_KEYS.seoTplPageDescription,
  },
};

export const SEO_TYPE_LABELS: Record<SeoType, string> = {
  product: "Products",
  category: "Product categories",
  post: "Blog posts",
  blogCategory: "Blog categories",
  page: "Content pages",
};

/**
 * The title and description an item should actually publish.
 *
 * Precedence is the item's own wording, then its type's template, then the
 * item's plain name - so a shop that writes nothing still gets a sensible
 * "Name | Shop" rather than a bare product name.
 */
export async function resolveSeo(
  type: SeoType,
  own: { seoTitle?: string | null; seoDescription?: string | null },
  ctx: SeoContext,
): Promise<{ title: string; description: string | undefined }> {
  const settings = await getSettings();
  const keys = KEYS[type];

  const pick = (ownValue: string | null | undefined, templateKey: string) => {
    const mine = (ownValue ?? "").trim();
    if (mine) return tidy(expandSeo(mine, ctx));
    const template = (settings[templateKey] ?? "").trim();
    if (template) return tidy(expandSeo(template, ctx));
    return "";
  };

  return {
    title: pick(own.seoTitle, keys.title) || ctx.title || "",
    // An empty description is left undefined rather than "": Next omits the
    // meta tag entirely, which is better than publishing a blank one.
    description: pick(own.seoDescription, keys.description) || undefined,
  };
}

/**
 * Traffic-light health for a listing column.
 *
 * Deliberately about the fields, not about the writing: it says whether this
 * item will publish a usable title and description, which is the part an admin
 * screen can actually know. It does not claim to judge keyword use.
 */
export type SeoHealth = { tone: "good" | "ok" | "bad"; label: string };

export function seoHealth(
  own: { seoTitle?: string | null; seoDescription?: string | null },
  hasTemplate: { title: boolean; description: boolean },
): SeoHealth {
  const ownTitle = Boolean((own.seoTitle ?? "").trim());
  const ownDescription = Boolean((own.seoDescription ?? "").trim());

  if (ownTitle && ownDescription) {
    return { tone: "good", label: "Title and description written for this item" };
  }
  const title = ownTitle || hasTemplate.title;
  const description = ownDescription || hasTemplate.description;

  if (title && description) {
    return {
      tone: "ok",
      label: "Using the default template for this content type",
    };
  }
  return {
    tone: "bad",
    label: description
      ? "No search title - add one here or set a default template"
      : "No meta description - add one here or set a default template",
  };
}

/** Whether each type's template is filled in, for the health column. */
export async function templatePresence(
  type: SeoType,
): Promise<{ title: boolean; description: boolean }> {
  const settings = await getSettings();
  const keys = KEYS[type];
  return {
    title: Boolean((settings[keys.title] ?? "").trim()),
    description: Boolean((settings[keys.description] ?? "").trim()),
  };
}
