import { getSettings } from "@/lib/settings";
import {
  GF_CATEGORY_FALLBACKS,
  GF_CLUB,
  GF_FEATURES,
  GF_HERO,
  GF_PROMO,
  GF_TESTIMONIALS,
} from "@/lib/brand-content";

/**
 * The Br3thr homepage's editable content: every section's switch and
 * wording, set under Admin > Home Page Control. Stored as one JSON setting so
 * the page reads it in a single lookup; anything missing falls back to the
 * design's own copy, so a blank field can never leave a section empty.
 */
export const GF_HOME_KEY = "gf.home";

export const GF_FEATURE_ICONS = ["leaf", "truck", "shield", "headset", "diamond", "crown", "gift", "globe", "star", "heart"] as const;

export type GfHomeContent = {
  hero: {
    show: boolean;
    eyebrow: string;
    line1: string;
    line2: string;
    text: string;
    ctaLabel: string;
    ctaHref: string;
    image: string;
    badges: [string, string, string];
  };
  categories: { show: boolean; eyebrow: string; title: string; count: number; slugs: string };
  featured: { show: boolean; eyebrow: string; title: string; linkLabel: string; linkHref: string; count: number };
  promo: { show: boolean; eyebrow: string; title: string; highlight: string; text: string; ctaLabel: string; ctaHref: string; image: string };
  features: { show: boolean; items: { icon: string; title: string; text: string }[] };
  testimonials: { show: boolean; eyebrow: string; title: string; source: "reviews" | "custom"; items: { body: string; name: string }[] };
  club: { show: boolean; titleStart: string; titleAccent: string; titleEnd: string; text: string; placeholder: string; button: string; left: string; right: string };
};

export const GF_HOME_DEFAULTS: GfHomeContent = {
  hero: {
    show: true,
    eyebrow: GF_HERO.eyebrow,
    line1: GF_HERO.line1,
    line2: GF_HERO.line2,
    text: GF_HERO.text,
    ctaLabel: GF_HERO.cta.label,
    ctaHref: GF_HERO.cta.href,
    image: GF_HERO.image,
    badges: GF_HERO.badges.map((b) => b.label.replace(/\n/g, " ")) as [string, string, string],
  },
  categories: { show: true, eyebrow: "Shop by Category", title: "Explore Our Collection", count: 4, slugs: "" },
  featured: { show: true, eyebrow: "Bestsellers", title: "Featured Products", linkLabel: "View All Products", linkHref: "/shop", count: 4 },
  promo: {
    show: true,
    eyebrow: GF_PROMO.eyebrow,
    title: GF_PROMO.title,
    highlight: GF_PROMO.highlight,
    text: GF_PROMO.text,
    ctaLabel: GF_PROMO.cta.label,
    ctaHref: GF_PROMO.cta.href,
    image: GF_PROMO.image,
  },
  features: { show: true, items: GF_FEATURES.map((f) => ({ icon: f.icon, title: f.title, text: f.text })) },
  testimonials: { show: true, eyebrow: "Testimonials", title: "What Our Customers Say", source: "reviews", items: GF_TESTIMONIALS.map((t) => ({ ...t })) },
  club: {
    show: true,
    titleStart: GF_CLUB.titleStart,
    titleAccent: GF_CLUB.titleAccent,
    titleEnd: GF_CLUB.titleEnd,
    text: GF_CLUB.text,
    placeholder: GF_CLUB.placeholder,
    button: GF_CLUB.button,
    left: GF_CLUB.left,
    right: GF_CLUB.right,
  },
};

export { GF_CATEGORY_FALLBACKS };

type Loose = Record<string, unknown>;
const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Saved JSON merged over the defaults, field by field. */
export function mergeGfHome(raw: string | null | undefined): GfHomeContent {
  let saved: Loose = {};
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object") saved = parsed as Loose;
  } catch {
    /* A broken setting falls back to the design copy. */
  }
  const d = GF_HOME_DEFAULTS;
  const sec = (k: keyof GfHomeContent) => ((saved[k] && typeof saved[k] === "object" ? saved[k] : {}) as Loose);
  const h = sec("hero"), c = sec("categories"), f = sec("featured"), p = sec("promo"), fe = sec("features"), t = sec("testimonials"), cl = sec("club");
  const badges = Array.isArray(h.badges) ? h.badges : [];
  const feItems = Array.isArray(fe.items) ? (fe.items as Loose[]) : [];
  const tItems = Array.isArray(t.items) ? (t.items as Loose[]) : [];

  return {
    hero: {
      show: bool(h.show, d.hero.show),
      eyebrow: str(h.eyebrow, d.hero.eyebrow),
      line1: str(h.line1, d.hero.line1),
      line2: str(h.line2, d.hero.line2),
      text: str(h.text, d.hero.text),
      ctaLabel: str(h.ctaLabel, d.hero.ctaLabel),
      ctaHref: str(h.ctaHref, d.hero.ctaHref),
      image: str(h.image, d.hero.image),
      badges: d.hero.badges.map((b, i) => str(badges[i], b)) as [string, string, string],
    },
    categories: {
      show: bool(c.show, d.categories.show),
      eyebrow: str(c.eyebrow, d.categories.eyebrow),
      title: str(c.title, d.categories.title),
      count: num(c.count, d.categories.count, 1, 8),
      slugs: typeof c.slugs === "string" ? c.slugs.trim() : "",
    },
    featured: {
      show: bool(f.show, d.featured.show),
      eyebrow: str(f.eyebrow, d.featured.eyebrow),
      title: str(f.title, d.featured.title),
      linkLabel: str(f.linkLabel, d.featured.linkLabel),
      linkHref: str(f.linkHref, d.featured.linkHref),
      count: num(f.count, d.featured.count, 1, 12),
    },
    promo: {
      show: bool(p.show, d.promo.show),
      eyebrow: str(p.eyebrow, d.promo.eyebrow),
      title: str(p.title, d.promo.title),
      highlight: str(p.highlight, d.promo.highlight),
      text: str(p.text, d.promo.text),
      ctaLabel: str(p.ctaLabel, d.promo.ctaLabel),
      ctaHref: str(p.ctaHref, d.promo.ctaHref),
      image: str(p.image, d.promo.image),
    },
    features: {
      show: bool(fe.show, d.features.show),
      items: d.features.items.map((item, i) => ({
        icon: GF_FEATURE_ICONS.includes(feItems[i]?.icon as (typeof GF_FEATURE_ICONS)[number]) ? String(feItems[i].icon) : item.icon,
        title: str(feItems[i]?.title, item.title),
        text: str(feItems[i]?.text, item.text),
      })),
    },
    testimonials: {
      show: bool(t.show, d.testimonials.show),
      eyebrow: str(t.eyebrow, d.testimonials.eyebrow),
      title: str(t.title, d.testimonials.title),
      source: t.source === "custom" ? "custom" : "reviews",
      items: d.testimonials.items.map((item, i) => ({ body: str(tItems[i]?.body, item.body), name: str(tItems[i]?.name, item.name) })),
    },
    club: {
      show: bool(cl.show, d.club.show),
      titleStart: str(cl.titleStart, d.club.titleStart),
      titleAccent: str(cl.titleAccent, d.club.titleAccent),
      titleEnd: str(cl.titleEnd, d.club.titleEnd),
      text: str(cl.text, d.club.text),
      placeholder: str(cl.placeholder, d.club.placeholder),
      button: str(cl.button, d.club.button),
      left: str(cl.left, d.club.left),
      right: str(cl.right, d.club.right),
    },
  };
}

export async function getGfHome(): Promise<GfHomeContent> {
  return mergeGfHome((await getSettings())[GF_HOME_KEY]);
}

/** The admin form, read back into the stored shape. Blank fields fall back to the design copy on read. */
export function gfHomeFromForm(fd: FormData): GfHomeContent {
  const t = (k: string, max = 300) => String(fd.get(k) ?? "").trim().slice(0, max);
  const on = (k: string) => fd.get(k) === "on";
  return mergeGfHome(
    JSON.stringify({
      hero: {
        show: on("hero.show"),
        eyebrow: t("hero.eyebrow"),
        line1: t("hero.line1"),
        line2: t("hero.line2"),
        text: t("hero.text", 600),
        ctaLabel: t("hero.ctaLabel"),
        ctaHref: t("hero.ctaHref"),
        image: t("hero.image"),
        badges: [t("hero.badge0"), t("hero.badge1"), t("hero.badge2")],
      },
      categories: { show: on("categories.show"), eyebrow: t("categories.eyebrow"), title: t("categories.title"), count: t("categories.count"), slugs: t("categories.slugs", 600) },
      featured: { show: on("featured.show"), eyebrow: t("featured.eyebrow"), title: t("featured.title"), linkLabel: t("featured.linkLabel"), linkHref: t("featured.linkHref"), count: t("featured.count") },
      promo: {
        show: on("promo.show"),
        eyebrow: t("promo.eyebrow"),
        title: t("promo.title"),
        highlight: t("promo.highlight"),
        text: t("promo.text", 600),
        ctaLabel: t("promo.ctaLabel"),
        ctaHref: t("promo.ctaHref"),
        image: t("promo.image"),
      },
      features: {
        show: on("features.show"),
        items: [0, 1, 2, 3].map((i) => ({ icon: t(`features.${i}.icon`), title: t(`features.${i}.title`), text: t(`features.${i}.text`) })),
      },
      testimonials: {
        show: on("testimonials.show"),
        eyebrow: t("testimonials.eyebrow"),
        title: t("testimonials.title"),
        source: t("testimonials.source"),
        items: [0, 1, 2].map((i) => ({ body: t(`testimonials.${i}.body`, 600), name: t(`testimonials.${i}.name`) })),
      },
      club: {
        show: on("club.show"),
        titleStart: t("club.titleStart"),
        titleAccent: t("club.titleAccent"),
        titleEnd: t("club.titleEnd"),
        text: t("club.text", 600),
        placeholder: t("club.placeholder"),
        button: t("club.button"),
        left: t("club.left"),
        right: t("club.right"),
      },
    }),
  );
}
