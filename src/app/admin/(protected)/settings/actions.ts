"use server";

import { revalidatePath } from "next/cache";
import { bannerStyle } from "@/lib/banner-types";
import { footerStyle, headerStyle } from "@/lib/chrome-style";
import { HOME_SECTIONS } from "@/lib/home-sections";
import { redirect } from "next/navigation";
import { sanitizeCustomCss } from "@/lib/custom-css";
import { sanitizeRichText, sanitizeShortText } from "@/lib/rich-text";

import { can, requireCapability } from "@/lib/permissions";
import { parseMenuRows, replaceMenu } from "@/lib/navigation";
import { SETTING_KEYS, getSettings, setSettings } from "@/lib/settings";
import { parsePriceToCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { sendTestRequest } from "@/lib/portal";
import { robotsChoice, searchConsoleToken } from "@/lib/seo-meta";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const bool = (fd: FormData, name: string) => (fd.get(name) === "on" ? "1" : "0");
const cents = (fd: FormData, name: string) =>
  String(parsePriceToCents(text(fd, name)) ?? 0);

export async function saveGeneralSettings(fd: FormData): Promise<void> {
  const me = await requireCapability("appearance");

  /*
   * Maintenance mode is on this page but is not a design setting - it takes the
   * whole shop offline. It stays with "settings" so the person who edits the
   * logo cannot close the store, and the field is ignored rather than trusted
   * from the form: the input is hidden for them, and a hidden input is not a
   * permission check.
   */
  const mayToggleShop = can(me.role, "settings");
  const current = await getSettings();

  await setSettings({
    [SETTING_KEYS.storeName]: text(fd, "storeName") || "Br3thr",
    [SETTING_KEYS.storeTagline]: text(fd, "storeTagline"),
    [SETTING_KEYS.storeCurrency]: text(fd, "storeCurrency") || "CAD",
    [SETTING_KEYS.storeLocale]: text(fd, "storeLocale") || "en-CA",
    [SETTING_KEYS.storeTimezone]:
      text(fd, "storeTimezone") || "America/Vancouver",
    [SETTING_KEYS.contactEmail]: text(fd, "contactEmail"),
    [SETTING_KEYS.contactPhone]: text(fd, "contactPhone"),
    [SETTING_KEYS.storeAddress]: text(fd, "storeAddress"),
    [SETTING_KEYS.faviconUrl]: text(fd, "faviconUrl"),
    [SETTING_KEYS.maintenanceMode]: mayToggleShop
      ? bool(fd, "maintenanceMode")
      : (current[SETTING_KEYS.maintenanceMode] ?? "0"),
    /*
     * Stored sanitised rather than sanitised at render, so what is in the
     * database is already safe to inject and a future reader can't forget.
     */
    [SETTING_KEYS.customCss]: sanitizeCustomCss(text(fd, "customCss")),
    [SETTING_KEYS.adminCustomCss]: sanitizeCustomCss(text(fd, "adminCustomCss")),
  });
  // Both layouts read these, and the storefront caches per-path.
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
  redirect("/admin/settings?saved=1");
}

export async function saveStoreSettings(fd: FormData): Promise<void> {
  await requireCapability("settings");
  await setSettings({
    // Shipping is no longer set here - see Shop Settings › Shipping. Not
    // writing these keys keeps a save of this page from blanking them.

    // The band across the top of /shop.
    [SETTING_KEYS.shopHeroTitle]: text(fd, "shopHeroTitle"),
    [SETTING_KEYS.shopHeroSubtitle]: text(fd, "shopHeroSubtitle"),
    // Checkboxes post one value per ticked category.
    [SETTING_KEYS.shopHeroCategories]: fd
      .getAll("shopHeroCategories")
      .map((v) => String(v).trim())
      .filter(Boolean)
      .join("\n"),
    [SETTING_KEYS.shopHeroShowCounts]: fd.get("shopHeroShowCounts") === "on" ? "1" : "0",
    [SETTING_KEYS.shopHeroBg]: text(fd, "shopHeroBg"),
    [SETTING_KEYS.shopHeroText]: text(fd, "shopHeroText"),
    [SETTING_KEYS.shopHeroImage]: text(fd, "shopHeroImage"),
  });
  revalidatePath("/shop");
  // The mega menu lives in the header, which is on every storefront page, so
  // switching it on or off has to clear more than the shop page.
  revalidatePath("/", "layout");
  revalidatePath("/admin/settings/store");
  redirect("/admin/settings/store?saved=1");
}

/** Interac e-Transfer is the only payment method this store accepts. */
export async function savePaymentSettings(fd: FormData): Promise<void> {
  await requireCapability("settings");

  await setSettings({
    [SETTING_KEYS.emtRecipientEmail]: text(fd, "emtRecipientEmail"),
    [SETTING_KEYS.emtRecipientName]: text(fd, "emtRecipientName"),
    [SETTING_KEYS.emtBankName]: text(fd, "emtBankName"),
    [SETTING_KEYS.emtSecurityQuestion]: text(fd, "emtSecurityQuestion"),
    [SETTING_KEYS.emtAutoDeposit]: bool(fd, "emtAutoDeposit"),
    [SETTING_KEYS.emtInstructions]: text(fd, "emtInstructions"),
    [SETTING_KEYS.emtMinOrderCents]: cents(fd, "emtMinOrder"),
    [SETTING_KEYS.emtMaxOrderCents]: cents(fd, "emtMaxOrder"),
    [SETTING_KEYS.emtExpiryHours]: String(Number(text(fd, "emtExpiryHours")) || 48),
    [SETTING_KEYS.emtTitle]: text(fd, "emtTitle") || "Email Money Transfer",
    [SETTING_KEYS.emtDescription]: text(fd, "emtDescription"),
    [SETTING_KEYS.emtUseRandomAnswer]: bool(fd, "emtUseRandomAnswer"),
    [SETTING_KEYS.emtStaticAnswer]: text(fd, "emtStaticAnswer"),
    // Positive = discount, negative = surcharge, clamped to +/-100.
    [SETTING_KEYS.emtAdjustPercent]: String(
      Math.max(-100, Math.min(100, Number(text(fd, "emtAdjustPercent")) || 0)),
    ),
    [SETTING_KEYS.emtAdjustMessage]: text(fd, "emtAdjustMessage"),
    [SETTING_KEYS.emtAutoCancelDays]: String(
      Math.max(0, Math.round(Number(text(fd, "emtAutoCancelDays")) || 0)),
    ),
    [SETTING_KEYS.emtDebugLog]: bool(fd, "emtDebugLog"),
    [SETTING_KEYS.portalEnabled]: bool(fd, "portalEnabled"),
    [SETTING_KEYS.portalUrl]: text(fd, "portalUrl"),
  });

  // A blank token means "leave the stored one alone" rather than wipe it.
  const portalToken = text(fd, "portalToken");
  if (portalToken && !portalToken.startsWith("•")) {
    await setSettings({ [SETTING_KEYS.portalToken]: portalToken });
  }
  const portalSecret = text(fd, "portalSigningSecret");
  if (portalSecret && !portalSecret.startsWith("•")) {
    await setSettings({ [SETTING_KEYS.portalSigningSecret]: portalSecret });
  }

  await prisma.paymentMethod.upsert({
    where: { key: "emt" },
    create: {
      key: "emt",
      label: "Interac e-Transfer",
      instructions: text(fd, "emtInstructions"),
      isEnabled: fd.get("enabled_emt") === "on",
      sortOrder: 0,
    },
    update: {
      instructions: text(fd, "emtInstructions"),
      isEnabled: fd.get("enabled_emt") === "on",
    },
  });

  revalidatePath("/admin/settings/payments");
  revalidatePath("/admin/settings/payments/emt");
  redirect("/admin/settings/payments/emt?saved=1");
}

export async function saveSeoSettings(fd: FormData): Promise<void> {
  await requireCapability("settings");
  await setSettings({
    [SETTING_KEYS.seoMetaTitle]: text(fd, "seoMetaTitle"),
    [SETTING_KEYS.seoMetaDescription]: text(fd, "seoMetaDescription"),
    [SETTING_KEYS.seoOgImage]: text(fd, "seoOgImage"),
    // The bare code when it can be read out of a pasted tag; otherwise kept as
    // typed so the settings page can say it was not recognised.
    [SETTING_KEYS.seoSearchConsole]:
      searchConsoleToken(text(fd, "seoSearchConsole")) || text(fd, "seoSearchConsole"),
    [SETTING_KEYS.seoRobots]: robotsChoice(text(fd, "seoRobots")),
    [SETTING_KEYS.sitemapEnabled]: bool(fd, "sitemapEnabled"),
    [SETTING_KEYS.sitemapProducts]: bool(fd, "sitemapProducts"),
    [SETTING_KEYS.sitemapCategories]: bool(fd, "sitemapCategories"),
    [SETTING_KEYS.sitemapPages]: bool(fd, "sitemapPages"),
    [SETTING_KEYS.seoTplProductTitle]: text(fd, "tplProductTitle"),
    [SETTING_KEYS.seoTplProductDescription]: text(fd, "tplProductDescription"),
    [SETTING_KEYS.seoTplCategoryTitle]: text(fd, "tplCategoryTitle"),
    [SETTING_KEYS.seoTplCategoryDescription]: text(fd, "tplCategoryDescription"),
    [SETTING_KEYS.seoTplPostTitle]: text(fd, "tplPostTitle"),
    [SETTING_KEYS.seoTplPostDescription]: text(fd, "tplPostDescription"),
    [SETTING_KEYS.seoTplBlogCategoryTitle]: text(fd, "tplBlogCategoryTitle"),
    [SETTING_KEYS.seoTplBlogCategoryDescription]: text(fd, "tplBlogCategoryDescription"),
    [SETTING_KEYS.seoTplPageTitle]: text(fd, "tplPageTitle"),
    [SETTING_KEYS.seoTplPageDescription]: text(fd, "tplPageDescription"),
    [SETTING_KEYS.sitemapBlog]: bool(fd, "sitemapBlog"),
    [SETTING_KEYS.sitemapBlogCategories]: bool(fd, "sitemapBlogCategories"),
  });
  revalidatePath("/admin/settings/seo");
  redirect("/admin/settings/seo?saved=1");
}

export async function saveMaintenanceSettings(fd: FormData): Promise<void> {
  // This page is the one that exists to control it, and it stays "settings".
  await requireCapability("settings");
  await setSettings({
    [SETTING_KEYS.maintenanceMode]: bool(fd, "maintenanceMode"),
  });
  revalidatePath("/admin", "layout");
  redirect("/admin/settings/maintenance?saved=1");
}

export async function saveTaxSettings(fd: FormData): Promise<void> {
  await requireCapability("settings");
  await setSettings({
    [SETTING_KEYS.taxPercent]: String(Number(text(fd, "taxPercent")) || 0),
    [SETTING_KEYS.taxLabel]: text(fd, "taxLabel") || "Tax",
    [SETTING_KEYS.taxNumber]: text(fd, "taxNumber"),
    [SETTING_KEYS.taxInclusive]: bool(fd, "taxInclusive"),
  });
  revalidatePath("/admin/finance/tax");
  redirect("/admin/finance/tax?saved=1");
}

export async function saveHomeSettings(fd: FormData): Promise<void> {
  await requireCapability("settings");

  await setSettings({
    [SETTING_KEYS.heroHeadline]: text(fd, "heroHeadline"),
    [SETTING_KEYS.heroAccent]: text(fd, "heroAccent"),
    [SETTING_KEYS.heroSubtitle]: text(fd, "heroSubtitle"),
    [SETTING_KEYS.heroCtaLabel]: text(fd, "heroCtaLabel"),
    [SETTING_KEYS.heroCtaHref]: text(fd, "heroCtaHref"),
    [SETTING_KEYS.heroImage]: text(fd, "heroImage"),
    [SETTING_KEYS.heroBackground]: text(fd, "heroBackground"),
    [SETTING_KEYS.heroOverlay]: text(fd, "heroOverlay") === "dark" ? "dark" : "light",
    [SETTING_KEYS.heroEyebrow]: text(fd, "heroEyebrow"),
    [SETTING_KEYS.heroCta2Label]: text(fd, "heroCta2Label"),
    [SETTING_KEYS.heroCta2Href]: text(fd, "heroCta2Href"),
  });
  revalidatePath("/", "layout");
  revalidatePath("/admin/content/home");
  redirect("/admin/content/home?saved=1");
}

/** Home page control > Homepage layout, and the banner homepage's own fields. */
export async function saveHomeLayout(fd: FormData): Promise<void> {
  await requireCapability("settings");
  await setSettings({
    [SETTING_KEYS.homeLayout]: text(fd, "homeLayout") === "banner" ? "banner" : "classic",
    [SETTING_KEYS.storeTheme]: text(fd, "storeTheme") === "classic" ? "classic" : "br3thr",
    [SETTING_KEYS.bannerStyle]: bannerStyle(text(fd, "bannerStyle")),
    [SETTING_KEYS.bannerHeroImage]: text(fd, "bannerHeroImage"),
    [SETTING_KEYS.bannerHeroCtaLabel]: text(fd, "bannerHeroCtaLabel"),
    [SETTING_KEYS.bannerHeroCtaHref]: text(fd, "bannerHeroCtaHref"),
    [SETTING_KEYS.bannerFeatureImage]: text(fd, "bannerFeatureImage"),
    [SETTING_KEYS.bannerFeatureLogo]: text(fd, "bannerFeatureLogo"),
    [SETTING_KEYS.bannerFeatureTitle]: text(fd, "bannerFeatureTitle"),
    [SETTING_KEYS.bannerFeatureText]: text(fd, "bannerFeatureText"),
    [SETTING_KEYS.bannerFeatureCtaLabel]: text(fd, "bannerFeatureCtaLabel"),
    [SETTING_KEYS.bannerFeatureCtaHref]: text(fd, "bannerFeatureCtaHref"),
  });
  revalidatePath("/", "layout");
  revalidatePath("/admin/content/home");
  redirect("/admin/content/home?saved=1");
}

export async function savePromoPopupSettings(fd: FormData): Promise<void> {
  await requireCapability("settings");
  await setSettings({
    [SETTING_KEYS.salesPopEnabled]: bool(fd, "salesPopEnabled"),
    [SETTING_KEYS.salesPopIntervalSeconds]: String(
      Math.min(300, Math.max(8, Math.round(Number(text(fd, "salesPopIntervalSeconds")) || 18))),
    ),
    [SETTING_KEYS.salesPopDurationSeconds]: String(
      Math.min(60, Math.max(2, Math.round(Number(text(fd, "salesPopDurationSeconds")) || 6))),
    ),
    [SETTING_KEYS.salesPopFallback]: text(fd, "salesPopFallback"),
    [SETTING_KEYS.contactFabEnabled]: bool(fd, "contactFabEnabled"),
    [SETTING_KEYS.contactFabLabel]: text(fd, "contactFabLabel"),
    [SETTING_KEYS.contactFabEmail]: text(fd, "contactFabEmail"),
    [SETTING_KEYS.contactFabPhone]: text(fd, "contactFabPhone"),
    [SETTING_KEYS.contactFabWhatsapp]: text(fd, "contactFabWhatsapp"),
    [SETTING_KEYS.promoPopupEnabled]: bool(fd, "promoPopupEnabled"),
    [SETTING_KEYS.promoPopupTitle]: text(fd, "promoPopupTitle"),
    [SETTING_KEYS.promoPopupHighlight]: text(fd, "promoPopupHighlight"),
    [SETTING_KEYS.promoPopupBody]: text(fd, "promoPopupBody"),
    [SETTING_KEYS.promoPopupImage]: text(fd, "promoPopupImage"),
    [SETTING_KEYS.promoPopupButton]: text(fd, "promoPopupButton"),
    [SETTING_KEYS.promoPopupDismiss]: text(fd, "promoPopupDismiss"),
    [SETTING_KEYS.promoPopupSuccess]: text(fd, "promoPopupSuccess"),
    [SETTING_KEYS.promoPopupCoupon]: text(fd, "promoPopupCoupon").toUpperCase(),
    [SETTING_KEYS.promoPopupDelaySeconds]: String(
      Math.min(60, Math.max(0, Math.round(Number(text(fd, "promoPopupDelaySeconds")) || 0))),
    ),
    [SETTING_KEYS.promoPopupEyebrow]: text(fd, "promoPopupEyebrow"),
    [SETTING_KEYS.checkoutExitEnabled]: bool(fd, "checkoutExitEnabled"),
    [SETTING_KEYS.checkoutExitTitle]: text(fd, "checkoutExitTitle"),
    [SETTING_KEYS.checkoutExitBody]: text(fd, "checkoutExitBody"),
    [SETTING_KEYS.checkoutExitCoupon]: text(fd, "checkoutExitCoupon").toUpperCase(),
    [SETTING_KEYS.checkoutExitButton]: text(fd, "checkoutExitButton"),
    [SETTING_KEYS.promoPopupHideAfterClaim]: bool(fd, "promoPopupHideAfterClaim"),
    [SETTING_KEYS.promoPopupShowDismiss]: bool(fd, "promoPopupShowDismiss"),
    [SETTING_KEYS.promoPopupShowClose]: bool(fd, "promoPopupShowClose"),
    [SETTING_KEYS.promoPopupFrequency]: (() => {
      const v = text(fd, "promoPopupFrequency");
      return ["always", "once", "session", "days"].includes(v) ? v : "days";
    })(),
    [SETTING_KEYS.promoPopupHideDays]: String(
      Math.min(365, Math.max(1, Math.round(Number(text(fd, "promoPopupHideDays")) || 30))),
    ),
  });
  revalidatePath("/", "layout");
  revalidatePath("/admin/content/promo-popup");
  redirect("/admin/content/promo-popup?saved=1");
}


/** Admin panel branding and colours. */
export async function saveAppearanceSettings(fd: FormData): Promise<void> {
  await requireCapability("appearance");

  // Only accept #rgb / #rrggbb so a bad value can't inject CSS.
  const colour = (name: string, fallback: string) => {
    const v = text(fd, name);
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : fallback;
  };

  await setSettings({
    [SETTING_KEYS.adminBrandText]: text(fd, "adminBrandText"),
    [SETTING_KEYS.adminLogoUrl]: text(fd, "adminLogoUrl"),
    [SETTING_KEYS.adminBrandMode]:
      ["text", "image", "both"].includes(text(fd, "adminBrandMode"))
        ? text(fd, "adminBrandMode")
        : "both",
    [SETTING_KEYS.storefrontPrimary]: colour("storefrontPrimary", "#7B2FF7"),
    [SETTING_KEYS.storefrontDark]: colour("storefrontDark", "#0D0A1C"),
    [SETTING_KEYS.storefrontHighlight]: colour("storefrontHighlight", "#FFC400"),
    [SETTING_KEYS.storefrontStyle]: text(fd, "storefrontStyle") === "flat" ? "flat" : "holo",
    [SETTING_KEYS.adminSidebarColor]: colour("adminSidebarColor", "#123C5E"),
    [SETTING_KEYS.adminAccentColor]: colour("adminAccentColor", "#1A6FB5"),
    [SETTING_KEYS.adminHeadingColor]: colour("adminHeadingColor", "#B4802A"),
    [SETTING_KEYS.adminScheme]: text(fd, "adminScheme") === "dark" ? "dark" : "light",
  });

  revalidatePath("/admin", "layout");
  redirect("/admin/settings/appearance?saved=1");
}


/** Points scheme + homepage section copy. */
export async function saveLoyaltySettings(fd: FormData): Promise<void> {
  await requireCapability("settings");

  const int = (name: string, fallback: number, min = 0, max = 1_000_000) => {
    const n = Math.round(Number(text(fd, name)));
    return String(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback);
  };

  await setSettings({
    [SETTING_KEYS.loyaltyEnabled]: bool(fd, "loyaltyEnabled"),
    [SETTING_KEYS.loyaltyEarnRate]: int("loyaltyEarnRate", 1),
    // Redeem rate is a divisor - never allow 0.
    [SETTING_KEYS.loyaltyRedeemRate]: int("loyaltyRedeemRate", 10, 1),
    [SETTING_KEYS.loyaltySignupBonus]: int("loyaltySignupBonus", 0),
    [SETTING_KEYS.loyaltyMinRedeem]: int("loyaltyMinRedeem", 0),
    [SETTING_KEYS.loyaltyMaxDiscountPercent]: int("loyaltyMaxDiscountPercent", 100, 0, 100),
    [SETTING_KEYS.loyaltyReferralPoints]: int("loyaltyReferralPoints", 0),
    // Entered in dollars on the form, stored in cents like all other money.
    [SETTING_KEYS.referralMinSpendCents]: String(
      Math.round((Number(text(fd, "referralMinSpend")) || 0) * 100),
    ),
    [SETTING_KEYS.referralFriendDiscountCents]: String(
      Math.round((Number(text(fd, "referralFriendDiscount")) || 0) * 100),
    ),
  });

  revalidatePath("/", "layout");
  redirect("/admin/settings/loyalty?saved=1");
}

/** Homepage section content. */
export async function saveHomeSections(fd: FormData): Promise<void> {
  await requireCapability("content");
  /* Only keys the code knows about, so a tampered form cannot write junk. */
  const order = text(fd, "homeSectionOrder")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => HOME_SECTIONS.some((sec) => sec.key === k));

  await setSettings({
    [SETTING_KEYS.homeSectionOrder]: order.join(","),
    // USP strip
    [SETTING_KEYS.homeUspEnabled]: bool(fd, "homeUspEnabled"),
    [SETTING_KEYS.homeUspTitle]: text(fd, "homeUspTitle"),
    [SETTING_KEYS.homeUsps]: text(fd, "homeUsps"),
    // Shop by category
    [SETTING_KEYS.homeCategoriesEnabled]: bool(fd, "homeCategoriesEnabled"),
    [SETTING_KEYS.homeCategoriesTitle]: text(fd, "homeCategoriesTitle"),
    [SETTING_KEYS.categoryStripSubtitle]: text(fd, "categoryStripSubtitle"),
    // Daily discount
    [SETTING_KEYS.homeDealsEnabled]: bool(fd, "homeDealsEnabled"),
    [SETTING_KEYS.homeDealsTitle]: text(fd, "homeDealsTitle"),
    [SETTING_KEYS.homeDealsSubtitle]: text(fd, "homeDealsSubtitle"),
    // Best selling
    [SETTING_KEYS.homeBestEnabled]: bool(fd, "homeBestEnabled"),
    [SETTING_KEYS.homeBestTitle]: text(fd, "homeBestTitle"),
    [SETTING_KEYS.homeBestSubtitle]: text(fd, "homeBestSubtitle"),
    // Join / points
    [SETTING_KEYS.homeSignupEnabled]: bool(fd, "homeSignupEnabled"),
    [SETTING_KEYS.homeSignupTitle]: text(fd, "homeSignupTitle"),
    [SETTING_KEYS.homeSignupBody]: text(fd, "homeSignupBody"),
    // Our products selector
    [SETTING_KEYS.homeSelectorEnabled]: bool(fd, "homeSelectorEnabled"),
    [SETTING_KEYS.homeSelectorTitle]: text(fd, "homeSelectorTitle"),
    // Category cards
    [SETTING_KEYS.homePromoEnabled]: bool(fd, "homePromoEnabled"),
    [SETTING_KEYS.homeBannerImage]: text(fd, "homeBannerImage"),
    [SETTING_KEYS.homeBannerTitle]: text(fd, "homeBannerTitle"),
    [SETTING_KEYS.homeBannerText]: text(fd, "homeBannerText"),
    [SETTING_KEYS.homeBannerCtaLabel]: text(fd, "homeBannerCtaLabel"),
    [SETTING_KEYS.homeBannerCtaHref]: text(fd, "homeBannerCtaHref"),
    [SETTING_KEYS.homeBannerMarquee]: text(fd, "homeBannerMarquee"),
    // Newly launched
    [SETTING_KEYS.homeNewEnabled]: bool(fd, "homeNewEnabled"),
    [SETTING_KEYS.homeNewTitle]: text(fd, "homeNewTitle"),
    [SETTING_KEYS.homeNewSubtitle]: text(fd, "homeNewSubtitle"),
    // Flash sale
    [SETTING_KEYS.homeFlashHeading]: bool(fd, "homeFlashHeading"),
    [SETTING_KEYS.homeFlashTitle]: text(fd, "homeFlashTitle"),
    [SETTING_KEYS.homeFlashSubtitle]: text(fd, "homeFlashSubtitle"),
    // Clearance
    [SETTING_KEYS.homeClearanceEnabled]: bool(fd, "homeClearanceEnabled"),
    [SETTING_KEYS.homeClearanceHeading]: bool(fd, "homeClearanceHeading"),
    [SETTING_KEYS.homeClearanceTitle]: text(fd, "homeClearanceTitle"),
    [SETTING_KEYS.homeClearanceSubtitle]: text(fd, "homeClearanceSubtitle"),
    // Reviews
    [SETTING_KEYS.homeReviewsEnabled]: bool(fd, "homeReviewsEnabled"),
    [SETTING_KEYS.homeReviewsTitle]: text(fd, "homeReviewsTitle"),
    [SETTING_KEYS.homeReviewsImage]: text(fd, "homeReviewsImage"),
  });
  revalidatePath("/", "layout");
  redirect("/admin/content/home?saved=1");
}


/** Fires a harmless probe at the portal and reports what came back. */
export async function testPortalConnection(): Promise<void> {
  await requireCapability("settings");
  const result = await sendTestRequest();

  const params = new URLSearchParams();
  if (result.ok) {
    params.set("test", "ok");
    params.set("code", String(result.status ?? 200));
  } else {
    params.set("test", "fail");
    params.set("detail", (result.error ?? `HTTP ${result.status}: ${result.body ?? ""}`).slice(0, 200));
  }

  redirect(`/admin/settings/payments/emt?${params.toString()}`);
}

/**
 * Product page copy: the delivery and returns notes beside the buy buttons,
 * the size chart dialog, and the two policy tabs under the gallery.
 *
 * The rich fields go through the same sanitiser as a product description, so
 * pasted markup cannot carry a script onto every product page at once.
 */
export async function saveProductPageSettings(fd: FormData): Promise<void> {
  await requireCapability("settings");
  await setSettings({
    [SETTING_KEYS.productDeliveryNote]: sanitizeShortText(text(fd, "productDeliveryNote")),
    [SETTING_KEYS.productReturnsNote]: sanitizeShortText(text(fd, "productReturnsNote")),
    [SETTING_KEYS.productSizeGuide]: sanitizeRichText(text(fd, "productSizeGuide")),
    [SETTING_KEYS.productShippingTab]: sanitizeRichText(text(fd, "productShippingTab")),
    [SETTING_KEYS.productReturnsTab]: sanitizeRichText(text(fd, "productReturnsTab")),
    [SETTING_KEYS.productCareTitle]: text(fd, "productCareTitle"),
    [SETTING_KEYS.productViewersLine]: bool(fd, "productViewersLine"),
  });
  revalidatePath("/", "layout");
  redirect("/admin/content/product?saved=1");
}

export async function saveFooterSettings(fd: FormData): Promise<void> {
  await requireCapability("settings");

  // The link columns ride along in the same form as the wording.
  const rows = parseMenuRows(fd.get("tree"));
  if (!rows) redirect("/admin/content/footer?error=parse");

  await setSettings({
    [SETTING_KEYS.footerContactHeading]: text(fd, "footerContactHeading"),
    [SETTING_KEYS.footerContactLabel]: text(fd, "footerContactLabel"),
    // Shared with the contact widget and general settings - one address.
    [SETTING_KEYS.contactEmail]: text(fd, "contactEmail"),
    [SETTING_KEYS.storeAddress]: text(fd, "storeAddress"),
    [SETTING_KEYS.contactFabWhatsapp]: text(fd, "contactFabWhatsapp"),
    [SETTING_KEYS.footerLiveChatEnabled]: bool(fd, "footerLiveChatEnabled"),
    [SETTING_KEYS.footerLiveChatLabel]: text(fd, "footerLiveChatLabel"),
    [SETTING_KEYS.footerContactLinkLabel]: text(fd, "footerContactLinkLabel"),
    [SETTING_KEYS.footerContactLinkUrl]: text(fd, "footerContactLinkUrl"),
    [SETTING_KEYS.footerLanguageEnabled]: bool(fd, "footerLanguageEnabled"),
    [SETTING_KEYS.footerNewsletterEnabled]: bool(fd, "footerNewsletterEnabled"),
    [SETTING_KEYS.footerNewsletterTitle]: text(fd, "footerNewsletterTitle"),
    [SETTING_KEYS.footerNewsletterSubtitle]: text(fd, "footerNewsletterSubtitle"),
    [SETTING_KEYS.footerNewsletterPlaceholder]: text(fd, "footerNewsletterPlaceholder"),
    [SETTING_KEYS.footerNewsletterButton]: text(fd, "footerNewsletterButton"),
    [SETTING_KEYS.footerLegalIntro]: text(fd, "footerLegalIntro"),
    [SETTING_KEYS.footerTermsUrl]: text(fd, "footerTermsUrl"),
    [SETTING_KEYS.footerPrivacyUrl]: text(fd, "footerPrivacyUrl"),
    [SETTING_KEYS.footerWordmarkEnabled]: bool(fd, "footerWordmarkEnabled"),
    [SETTING_KEYS.footerWordmarkText]: text(fd, "footerWordmarkText"),
    [SETTING_KEYS.footerCopyright]: text(fd, "footerCopyright"),
    [SETTING_KEYS.footerStyle]: footerStyle(text(fd, "footerStyle")),
    [SETTING_KEYS.footerAcceptText]: text(fd, "footerAcceptText"),
    [SETTING_KEYS.footerPaymentLogo]: text(fd, "footerPaymentLogo"),
    [SETTING_KEYS.footerShippingLogo]: text(fd, "footerShippingLogo"),
  });
  await replaceMenu("footer", rows);

  // The footer is in the root layout, so every storefront route caches it.
  revalidatePath("/", "layout");
  redirect("/admin/content/footer?saved=1");
}

export async function saveHeaderSettings(fd: FormData): Promise<void> {
  await requireCapability("settings");

  // The menu rides along in the same form as everything else.
  const rows = parseMenuRows(fd.get("tree"));
  if (!rows) redirect("/admin/content/header?error=parse");

  const mode = text(fd, "storeBrandMode");
  const width = Number(text(fd, "storeLogoWidth"));
  await setSettings({
    [SETTING_KEYS.headerStyle]: headerStyle(text(fd, "headerStyle")),
    [SETTING_KEYS.logoUrl]: text(fd, "logoUrl"),
    [SETTING_KEYS.storeBrandMode]: ["both", "image", "text"].includes(mode) ? mode : "both",
    // Blank means "use the default height", so an empty value must survive.
    [SETTING_KEYS.storeLogoWidth]:
      Number.isFinite(width) && width > 0 ? String(Math.min(400, Math.max(16, Math.round(width)))) : "",
    [SETTING_KEYS.headerSearchEnabled]: bool(fd, "headerSearchEnabled"),
    [SETTING_KEYS.headerWishlistEnabled]: bool(fd, "headerWishlistEnabled"),
    [SETTING_KEYS.headerAccountEnabled]: bool(fd, "headerAccountEnabled"),
    [SETTING_KEYS.headerSticky]: bool(fd, "headerSticky"),
    [SETTING_KEYS.headerDrawerButtonEnabled]: bool(fd, "headerDrawerButtonEnabled"),
    [SETTING_KEYS.headerDrawerButtonLabel]: text(fd, "headerDrawerButtonLabel"),
    [SETTING_KEYS.headerDrawerButtonUrl]: text(fd, "headerDrawerButtonUrl"),
  });
  await replaceMenu("header", rows);

  // The header is in the root layout, so every storefront route caches it.
  revalidatePath("/", "layout");
  redirect("/admin/content/header?saved=1");
}


/** Home Page Control: the one-page site's words and flavour colours, stored as one JSON setting. */
export async function saveSiteContent(fd: FormData): Promise<void> {
  await requireCapability("content");
  const { SITE_CONTENT_KEY, siteContentFromForm } = await import("@/lib/site-content");
  let names: string[] = [];
  try {
    const parsed = JSON.parse(String(fd.get("flavourNames") ?? "[]"));
    if (Array.isArray(parsed)) names = parsed.filter((n): n is string => typeof n === "string").slice(0, 24);
  } catch {
    names = [];
  }
  await setSettings({ [SITE_CONTENT_KEY]: JSON.stringify(siteContentFromForm(fd, names)) });
  revalidatePath("/", "layout");
  redirect("/admin/content/home?saved=1");
}

/** Home Page Control: the Br3thr storefront or the classic one. */
export async function saveStoreTheme(fd: FormData): Promise<void> {
  await requireCapability("settings");
  await setSettings({ [SETTING_KEYS.storeTheme]: text(fd, "storeTheme") === "classic" ? "classic" : "br3thr" });
  revalidatePath("/", "layout");
  redirect("/admin/content/home?saved=1");
}
