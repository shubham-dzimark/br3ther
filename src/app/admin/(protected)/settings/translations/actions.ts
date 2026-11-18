"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { setSettings, SETTING_KEYS } from "@/lib/settings";
import { getTranslateConfig, hashSource, translateMany } from "@/lib/translate";
import { getNavigation } from "@/lib/navigation";
import { getSettings } from "@/lib/settings";

const PAGE = "/admin/settings/translations";
const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();

export async function saveTranslateSettings(fd: FormData): Promise<void> {
  await requireCapability("appearance");

  const provider = ["none", "libre", "deepl", "google"].includes(text(fd, "provider"))
    ? text(fd, "provider")
    : "none";
  const typedKey = String(fd.get("apiKey") ?? "");

  await setSettings({
    [SETTING_KEYS.translateWidget]: fd.get("widget") === "on" ? "1" : "0",
    [SETTING_KEYS.translateEnabled]: fd.get("enabled") === "on" ? "1" : "0",
    [SETTING_KEYS.translateProvider]: provider,
    [SETTING_KEYS.translateEndpoint]: text(fd, "endpoint"),
    // Blank means "keep what is stored", so the key is never echoed into the page.
    ...(typedKey ? { [SETTING_KEYS.translateApiKey]: typedKey } : {}),
    [SETTING_KEYS.translateAutoOnRender]:
      fd.get("autoOnRender") === "on" ? "1" : "0",
  });

  revalidatePath(PAGE);
  revalidatePath("/", "layout");
  redirect(`${PAGE}?saved=1`);
}

/** Edit or add one translation by hand. Hand edits are never overwritten. */
export async function saveTranslation(fd: FormData): Promise<void> {
  await requireCapability("content");
  const source = text(fd, "source");
  const value = text(fd, "value");
  const locale = text(fd, "locale") || "fr";
  if (!source) redirect(PAGE);

  if (!value) {
    await prisma.translation.deleteMany({ where: { locale, sourceHash: hashSource(source) } });
  } else {
    await prisma.translation.upsert({
      where: { locale_sourceHash: { locale, sourceHash: hashSource(source) } },
      update: { value, isAuto: false },
      create: { locale, sourceHash: hashSource(source), source, value, isAuto: false },
    });
  }

  revalidatePath(PAGE);
  revalidatePath("/", "layout");
  redirect(`${PAGE}?saved=1`);
}

export async function deleteTranslation(fd: FormData): Promise<void> {
  await requireCapability("content");
  const id = text(fd, "id");
  if (id) await prisma.translation.delete({ where: { id } }).catch(() => null);

  revalidatePath(PAGE);
  revalidatePath("/", "layout");
  redirect(PAGE);
}

/**
 * Walk the shop's own content and translate anything not already known.
 *
 * Deliberately explicit rather than a background job: the admin presses it,
 * waits, and sees how many strings came back - which is the only way to tell
 * a working provider from a silently failing one.
 */
export async function translateEverything(): Promise<void> {
  await requireCapability("content");
  const config = await getTranslateConfig();
  if (!config.enabled || config.provider === "none") {
    redirect(`${PAGE}?error=provider`);
  }

  const [settings, nav, footerNav, categories, pages, products] = await Promise.all([
    getSettings(),
    getNavigation(),
    getNavigation("footer"),
    prisma.category.findMany({ select: { name: true, description: true } }),
    prisma.contentPage.findMany({ select: { title: true, body: true } }),
    prisma.product.findMany({
      where: { status: "PUBLISHED" },
      select: { name: true, shortDescription: true, description: true },
    }),
  ]);

  const CONTENT_KEYS = [
    SETTING_KEYS.storeTagline,
    SETTING_KEYS.footerNewsletterTitle, SETTING_KEYS.footerNewsletterSubtitle,
    SETTING_KEYS.footerContactHeading, SETTING_KEYS.footerContactLabel,
    SETTING_KEYS.footerLiveChatLabel, SETTING_KEYS.footerContactLinkLabel,
    SETTING_KEYS.footerNewsletterPlaceholder, SETTING_KEYS.footerNewsletterButton,
    SETTING_KEYS.footerLegalIntro, SETTING_KEYS.footerCopyright, SETTING_KEYS.footerAcceptText,
    SETTING_KEYS.homeUspTitle, SETTING_KEYS.homeUsps,
    SETTING_KEYS.homeSelectorTitle, SETTING_KEYS.homeReviewsTitle,
    SETTING_KEYS.homeSignupTitle, SETTING_KEYS.homeSignupBody,
    SETTING_KEYS.heroTitle, SETTING_KEYS.heroSubtitle, SETTING_KEYS.heroEyebrow,
    SETTING_KEYS.categoryStripSubtitle,
    SETTING_KEYS.promoPopupTitle, SETTING_KEYS.promoPopupHighlight,
    SETTING_KEYS.promoPopupBody, SETTING_KEYS.promoPopupButton,
    SETTING_KEYS.promoPopupSuccess, SETTING_KEYS.promoPopupEyebrow,
    SETTING_KEYS.contactFabLabel,
  ];

  const texts: string[] = [
    ...nav.flatMap((n) => [n.label, ...n.children.map((c) => c.label)]),
    ...footerNav.flatMap((n) => [n.label, ...n.children.map((c) => c.label)]),
    ...categories.flatMap((c) => [c.name, c.description ?? ""]),
    ...pages.flatMap((p) => [p.title, p.body]),
    ...products.flatMap((p) => [p.name, p.shortDescription ?? "", p.description ?? ""]),
    ...CONTENT_KEYS.map((k) => settings[k] ?? ""),
    // The USP band is one setting holding "icon|title|text" per line, so the
    // parts are pulled out or the whole blob would be sent as one string.
    ...(settings[SETTING_KEYS.homeUsps] ?? "")
      .split("\n")
      .flatMap((line) => line.split("|").slice(1)),
  ].filter((t) => t && t.trim().length > 0);

  const before = await prisma.translation.count({ where: { locale: "fr" } });
  await translateMany(texts, "fr", { ...config, autoOnRender: true });
  const after = await prisma.translation.count({ where: { locale: "fr" } });

  revalidatePath(PAGE);
  revalidatePath("/", "layout");
  redirect(`${PAGE}?saved=swept&n=${after - before}`);
}
