import { getSettings } from "@/lib/settings";

/*
 * The Br3thr one-page site's editable content, set under Admin > Home Page
 * Control and stored as one JSON setting so the page reads it in a single
 * lookup. Anything blank or missing falls back to the defaults below, which
 * are the site's own copy, so no section can ever render empty.
 *
 * The product itself (flavours, sizes, prices, stock) stays on the product
 * and its variants; this only holds what the page says and the colour each
 * flavour is shown in. "{pay}" in any text is replaced with the payment
 * methods checkout is offering right now (e.g. "Interac e-Transfer or crypto").
 */
export const SITE_CONTENT_KEY = "br3thr.site";

export type FlavourLook = { ground: string; lid: string };
export type SiteContent = {
  flavours: Record<string, FlavourLook>;
  hero: { lede: string };
  inside: { title: string; steps: { head: string; cap: string }[]; note: string };
  statement: { title: string; text: string; note: string };
  how: { title: string; steps: { title: string; text: string }[] };
  buy: { title: string; lede: string };
  faq: { title: string; items: { q: string; a: string }[] };
  close: { title: string; text: string };
};

export const FLAVOUR_DEFAULTS: Record<string, FlavourLook> = {
  Unflavoured: { ground: "#d9d5cc", lid: "#ecece8" },
  "Black cherry": { ground: "#cf8f99", lid: "#5a1020" },
  "Citrus salt": { ground: "#dccf5f", lid: "#d6cb4a" },
};
export const FLAVOUR_FALLBACK: FlavourLook = { ground: "#d9d5cc", lid: "#ecece8" };

export const SITE_DEFAULTS: SiteContent = {
  flavours: FLAVOUR_DEFAULTS,
  hero: { lede: "No.3 Daily Blend. One tub, thirty scoops, one month." },
  inside: {
    title: "What's inside",
    steps: [
      { head: "Six things, all named", cap: "Creatine 3 g, electrolytes 600 mg, magnesium 150 mg, vitamin D3 25 µg, citric acid, natural flavour." },
      { head: "Nothing hidden", cap: "No added sugar, no sweeteners, no fillers, no colour. Every amount is on the label." },
      { head: "Thirty scoops", cap: "300 g of powder and a measured 10 g scoop packed inside. One a day lasts a month." },
      { head: "A quarter turn", cap: "A foil seal under the lid, and it closes tight with one twist. The tub is recyclable PP 5." },
    ],
    note: "Amounts per 10 g scoop. No.3 is a demo product; this formula is a sample.",
  },
  statement: {
    title: "One product",
    text: "Br3thr makes one thing: a tub you finish in a month and reorder without thinking, because the scoop, the mix and the taste never change.",
    note: "The name is short for brother. The 3 stands in for the letters you skip when you say it fast, and it is the number on the tub. Brothers share what works; this is the thing worth sharing.",
  },
  how: {
    title: "How to take it",
    steps: [
      { title: "Day one", text: "One level scoop, 10 g, into 300 ml of cold water. Shake for twenty seconds until it’s clear." },
      { title: "Week one", text: "Same time every day. Most people take it in the morning, before anything else, so it never gets skipped." },
      { title: "Day thirty", text: "Thirty scoops and one empty tub. Order the next one in the last week and it arrives before you run out." },
    ],
  },
  buy: { title: "Take it home", lede: "One tub ships in a plain box. Pay by {pay} once the order is in." },
  faq: {
    title: "Questions before you buy",
    items: [
      { q: "How do I pay?", a: "By {pay}. Place the order and the next screen shows exactly where to send the money, the amount and the reference. Nothing is charged before that." },
      { q: "Where do you ship, and how fast?", a: "Anywhere in Canada. The order is packed once the payment lands, and the tracking number comes to your email the day it ships." },
      { q: "How much is shipping?", a: "It is worked out from your address and added to the order. You see the full total on your receipt before you send the payment." },
      { q: "What if I miss a day?", a: "Nothing happens. Take the next scoop the next day; one tub still lasts about a month." },
      { q: "Can I change or cancel an order?", a: "Yes, until it ships. Reply to the confirmation email or write to help@br3thr.com with your order number." },
      { q: "How do I follow my order?", a: "Use Track order with your order number and email, or sign in to see every order you've placed." },
    ],
  },
  close: { title: "Same scoop. Every day.", text: "One tub lasts a month. Order today and the first scoop is on its way this week." },
};

export const INSIDE_STEPS = 4;
export const HOW_STEPS = 3;
export const FAQ_SLOTS = 8;

const HEX = /^#[0-9a-f]{6}$/i;
const str = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim() : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function mergeSiteContent(raw: string | null | undefined): SiteContent {
  let j: Record<string, unknown> = {};
  try { j = obj(JSON.parse(raw ?? "{}")); } catch { j = {}; }
  const d = SITE_DEFAULTS;

  const fl = obj(j.flavours);
  const flavours: Record<string, FlavourLook> = { ...FLAVOUR_DEFAULTS };
  for (const [name, v] of Object.entries(fl)) {
    const base = FLAVOUR_DEFAULTS[name] ?? FLAVOUR_FALLBACK;
    const o = obj(v);
    flavours[name] = { ground: hex(o.ground, base.ground), lid: hex(o.lid, base.lid) };
  }

  const hero = obj(j.hero), inside = obj(j.inside), st = obj(j.statement), how = obj(j.how);
  const buy = obj(j.buy), faq = obj(j.faq), close = obj(j.close);
  const insideSteps = arr(inside.steps), howSteps = arr(how.steps);

  // FAQ: a stored list replaces the default one; rows with no question are dropped.
  const storedFaq = arr(faq.items)
    .map((x) => obj(x))
    .map((x) => ({ q: str(x.q, ""), a: str(x.a, "") }))
    .filter((x) => x.q && x.a);

  return {
    flavours,
    hero: { lede: str(hero.lede, d.hero.lede) },
    inside: {
      title: str(inside.title, d.inside.title),
      steps: d.inside.steps.map((s, i) => {
        const o = obj(insideSteps[i]);
        return { head: str(o.head, s.head), cap: str(o.cap, s.cap) };
      }),
      note: str(inside.note, d.inside.note),
    },
    statement: { title: str(st.title, d.statement.title), text: str(st.text, d.statement.text), note: str(st.note, d.statement.note) },
    how: {
      title: str(how.title, d.how.title),
      steps: d.how.steps.map((s, i) => {
        const o = obj(howSteps[i]);
        return { title: str(o.title, s.title), text: str(o.text, s.text) };
      }),
    },
    buy: { title: str(buy.title, d.buy.title), lede: str(buy.lede, d.buy.lede) },
    faq: { title: str(faq.title, d.faq.title), items: Array.isArray(faq.items) && storedFaq.length ? storedFaq : d.faq.items },
    close: { title: str(close.title, d.close.title), text: str(close.text, d.close.text) },
  };
}

export async function getSiteContent(): Promise<SiteContent> {
  return mergeSiteContent((await getSettings())[SITE_CONTENT_KEY]);
}

/** The look for one flavour: its saved colours, the built-in ones, or neutral. */
export function lookOf(content: SiteContent, flavour: string): FlavourLook {
  return content.flavours[flavour] ?? FLAVOUR_DEFAULTS[flavour] ?? FLAVOUR_FALLBACK;
}

/**
 * "{pay}" filled with the methods checkout offers now, in the words a buyer
 * uses: "Interac e-Transfer", "crypto", joined with "or".
 */
export function payPhrase(keys: string[]): string {
  const words = keys.map((k) => (k === "emt" ? "Interac e-Transfer" : k === "crypto" ? "crypto" : k));
  if (words.length === 0) return "the payment method shown at checkout";
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

export function fillPay(text: string, phrase: string): string {
  return text.replaceAll("{pay}", phrase);
}

/** The admin form, read back into the stored shape. Blank fields fall back to the defaults on read. */
export function siteContentFromForm(fd: FormData, flavourNames: string[]): SiteContent {
  const t = (k: string, max = 400) => String(fd.get(k) ?? "").trim().slice(0, max);
  const flavours: Record<string, { ground: string; lid: string }> = {};
  flavourNames.forEach((name, i) => {
    flavours[name] = { ground: t(`flavour.${i}.ground`, 7), lid: t(`flavour.${i}.lid`, 7) };
  });
  return mergeSiteContent(
    JSON.stringify({
      flavours,
      hero: { lede: t("hero.lede") },
      inside: {
        title: t("inside.title"),
        steps: Array.from({ length: INSIDE_STEPS }, (_, i) => ({ head: t(`inside.${i}.head`, 80), cap: t(`inside.${i}.cap`) })),
        note: t("inside.note"),
      },
      statement: { title: t("statement.title", 80), text: t("statement.text", 600), note: t("statement.note", 600) },
      how: {
        title: t("how.title", 80),
        steps: Array.from({ length: HOW_STEPS }, (_, i) => ({ title: t(`how.${i}.title`, 60), text: t(`how.${i}.text`) })),
      },
      buy: { title: t("buy.title", 80), lede: t("buy.lede") },
      faq: {
        title: t("faq.title", 80),
        items: Array.from({ length: FAQ_SLOTS }, (_, i) => ({ q: t(`faq.${i}.q`, 160), a: t(`faq.${i}.a`, 800) })),
      },
      close: { title: t("close.title", 80), text: t("close.text") },
    }),
  );
}
