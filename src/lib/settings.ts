import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const SETTING_KEYS = {
  // General
  storeName: "store.name",
  storeTagline: "store.tagline",
  storeCurrency: "store.currency",
  storeLocale: "store.locale",
  storeTimezone: "store.timezone",
  contactEmail: "store.contact_email",
  contactPhone: "store.contact_phone",
  storeAddress: "store.address",
  logoUrl: "store.logo_url",
  /// What the storefront header shows: "both" | "image" | "text".
  storeBrandMode: "store.brand_mode",
  /// Logo width in pixels in the header. Height follows the aspect ratio.
  storeLogoWidth: "store.logo_width",
  // Header - edited under Content -> Header with the logo and menu above.
  headerSearchEnabled: "header.search_enabled",
  headerWishlistEnabled: "header.wishlist_enabled",
  headerAccountEnabled: "header.account_enabled",
  headerSticky: "header.sticky",
  headerDrawerButtonEnabled: "header.drawer_button_enabled",
  headerDrawerButtonLabel: "header.drawer_button_label",
  headerDrawerButtonUrl: "header.drawer_button_url",
  faviconUrl: "store.favicon_url",
  maintenanceMode: "store.maintenance",

  // Admin appearance
  adminBrandText: "admin.brand_text",
  adminLogoUrl: "admin.logo_url",
  adminBrandMode: "admin.brand_mode", // "text" | "image" | "both"
  storefrontPrimary: "storefront.primary",
  storefrontDark: "storefront.dark",
  storefrontHighlight: "storefront.highlight",
  /// "holo" (logo gradients + animation) or "flat" (plain brand colours).
  storefrontStyle: "storefront.style",
  adminSidebarColor: "admin.sidebar_color",
  adminAccentColor: "admin.accent_color",
  adminHeadingColor: "admin.heading_color",
  /** "light" | "dark" - opt-in, never taken from the OS. */
  adminScheme: "admin.scheme",

  // EMT / payments
  emtRecipientEmail: "emt.recipient_email",
  emtSecurityQuestion: "emt.security_question",
  emtInstructions: "emt.instructions",
  emtAutoDeposit: "emt.auto_deposit",
  emtRecipientName: "emt.recipient_name",
  emtBankName: "emt.bank_name",
  emtMinOrderCents: "emt.min_order_cents",
  emtMaxOrderCents: "emt.max_order_cents",
  emtExpiryHours: "emt.expiry_hours",
  emtTitle: "emt.title",
  emtDescription: "emt.description",
  emtUseRandomAnswer: "emt.use_random_answer",
  emtStaticAnswer: "emt.static_answer",
  emtAdjustPercent: "emt.adjust_percent",
  emtAdjustMessage: "emt.adjust_message",
  emtAutoCancelDays: "emt.auto_cancel_days",
  emtDebugLog: "emt.debug_log",

  // Pay Portal sync
  portalEnabled: "portal.enabled",
  portalUrl: "portal.url",
  portalToken: "portal.token",
  portalSigningSecret: "portal.signing_secret",
  // Crypto Payment gateway (port of the crypto-pay WooCommerce plugin).
  cryptoEndpointUrl: "crypto.endpoint_url",
  cryptoStaticKey: "crypto.static_key",
  cryptoSiteKey: "crypto.site_key",
  cryptoCurrency: "crypto.currency",
  cryptoMode: "crypto.mode",
  cryptoTitle: "crypto.title",
  cryptoDescription: "crypto.description",
  cryptoActive: "crypto.active",

  // PayPal
  paypalMode: "paypal.mode",
  paypalClientId: "paypal.client_id",
  paypalSecret: "paypal.secret",
  paypalWebhookId: "paypal.webhook_id",
  paypalCurrency: "paypal.currency",

  // Other offline methods
  bankTransferDetails: "bank.details",
  codInstructions: "cod.instructions",
  codMaxOrderCents: "cod.max_order_cents",

  // Shipping & tax
  shippingFlatCents: "shipping.flat_cents",
  freeShippingOverCents: "shipping.free_over_cents",
  taxPercent: "tax.percent",
  taxLabel: "tax.label",
  taxNumber: "tax.number",
  taxInclusive: "tax.inclusive",

  // SEO
  seoMetaTitle: "seo.meta_title",
  seoMetaDescription: "seo.meta_description",
  seoOgImage: "seo.og_image",
  seoGaId: "seo.ga_id",
  seoSearchConsole: "seo.search_console",
  seoRobots: "seo.robots",
  sitemapEnabled: "seo.sitemap_enabled",
  sitemapProducts: "seo.sitemap_products",
  sitemapCategories: "seo.sitemap_categories",
  sitemapPages: "seo.sitemap_pages",
  /*
   * Search appearance templates, one pair per content type. An item's own
   * wording wins; these fill in for everything else.
   */
  seoTplProductTitle: "seo.tpl_product_title",
  seoTplProductDescription: "seo.tpl_product_description",
  seoTplCategoryTitle: "seo.tpl_category_title",
  seoTplCategoryDescription: "seo.tpl_category_description",
  seoTplPostTitle: "seo.tpl_post_title",
  seoTplPostDescription: "seo.tpl_post_description",
  seoTplBlogCategoryTitle: "seo.tpl_blog_category_title",
  seoTplBlogCategoryDescription: "seo.tpl_blog_category_description",
  seoTplPageTitle: "seo.tpl_page_title",
  seoTplPageDescription: "seo.tpl_page_description",
  sitemapBlog: "seo.sitemap_blog",
  sitemapBlogCategories: "seo.sitemap_blog_categories",

  /** Gift cards on/off: off hides the product and refuses codes at checkout. */
  giftCardsEnabled: "giftcards.enabled",
  // Footer - everything on it is edited under Content -> Footer.
  footerContactHeading: "footer.contact_heading",
  footerContactLabel: "footer.contact_label",
  footerLiveChatEnabled: "footer.live_chat_enabled",
  footerLiveChatLabel: "footer.live_chat_label",
  footerContactLinkLabel: "footer.contact_link_label",
  footerContactLinkUrl: "footer.contact_link_url",
  footerLanguageEnabled: "footer.language_enabled",
  footerNewsletterPlaceholder: "footer.newsletter_placeholder",
  footerNewsletterButton: "footer.newsletter_button",
  footerLegalIntro: "footer.legal_intro",
  footerTermsUrl: "footer.terms_url",
  footerPrivacyUrl: "footer.privacy_url",
  footerWordmarkEnabled: "footer.wordmark_enabled",
  footerWordmarkText: "footer.wordmark_text",
  footerCopyright: "footer.copyright",
  /// "full" (columns, newsletter, wordmark) or "copyright" (one line).
  footerStyle: "footer.style",
  /// "full" (announcement bar, menu, icons) or "simple" (menu icon, centred
  /// logo, search/account/cart, no announcement bar).
  headerStyle: "header.style",
  footerAcceptText: "footer.accept_text",
  footerPaymentLogo: "footer.payment_logo",
  /** The carrier mark beside the payment badge; Canada Post until changed. */
  footerShippingLogo: "footer.shipping_logo",
  /** Checkout street-address suggestions (Geoapify). The key is write-only in the admin. */
  addressLookupEnabled: "address.lookup_enabled",
  addressGeoapifyKey: "address.geoapify_key",
  footerNewsletterEnabled: "footer.newsletter_enabled",
  footerNewsletterTitle: "footer.newsletter_title",
  footerNewsletterSubtitle: "footer.newsletter_subtitle",
  slide1Eyebrow: "home.slide1_eyebrow",
  slide1Title: "home.slide1_title",
  slide1Text: "home.slide1_text",
  slide1Image: "home.slide1_image",
  slide1CtaLabel: "home.slide1_cta_label",
  slide1CtaHref: "home.slide1_cta_href",
  slide2Eyebrow: "home.slide2_eyebrow",
  slide2Title: "home.slide2_title",
  slide2Text: "home.slide2_text",
  slide2Image: "home.slide2_image",
  slide2CtaLabel: "home.slide2_cta_label",
  slide2CtaHref: "home.slide2_cta_href",
  slide3Eyebrow: "home.slide3_eyebrow",
  slide3Title: "home.slide3_title",
  slide3Text: "home.slide3_text",
  slide3Image: "home.slide3_image",
  slide3CtaLabel: "home.slide3_cta_label",
  slide3CtaHref: "home.slide3_cta_href",
  /// Which hero the home page shows: panels | video | banner.
  heroMode: "home.hero_mode",
  /// Full-bleed video hero.
  heroVideoUrl: "home.hero_video_url",
  heroVideoPoster: "home.hero_video_poster",
  /// Seconds between banner slides. 0 stops the carousel advancing on its own.
  heroBannerSeconds: "home.hero_banner_seconds",
  heroTitle: "home.hero_title",
  heroSubtitle: "home.hero_subtitle",
  heroImage: "home.hero_image",
  /// The banner photograph behind the hero's product picture. Separate images
  /// on purpose: the product sits on top of it and can be swapped alone.
  heroBackground: "home.hero_background",
  /// How the hero banner is veiled: "light" (white wash, dark words) or
  /// "dark" (black-into-purple wash, white words).
  heroOverlay: "home.hero_overlay",
  heroVideo: "home.hero_video",
  heroCtaLabel: "home.hero_cta_label",
  heroCtaHref: "home.hero_cta_href",
  /// Showcase hero: the headline, one line per row.
  heroHeadline: "home.hero_headline",
  heroAccent: "home.hero_accent",
  /// Second, text-style call to action beside the button ("Explore lookbook").
  heroCta2Label: "home.hero_cta2_label",
  heroCta2Href: "home.hero_cta2_href",
  /// Small pill above the hero headline, e.g. "Exclusive offer".
  heroEyebrow: "home.hero_eyebrow",
  /// Discount shown in the pill and the round badge. Blank hides both.
  heroBadgePercent: "home.hero_badge_percent",

  // The two promo cards flanking the hero
  heroCard1Title: "home.hero_card1_title",
  heroCard1Subtitle: "home.hero_card1_subtitle",
  heroCard1Image: "home.hero_card1_image",
  heroCard1Href: "home.hero_card1_href",
  heroCard2Title: "home.hero_card2_title",
  heroCard2Subtitle: "home.hero_card2_subtitle",
  heroCard2Image: "home.hero_card2_image",
  heroCard2Href: "home.hero_card2_href",
  /// Shared label under each category tile in the strip.
  categoryStripSubtitle: "home.category_strip_subtitle",
  // Recent-purchase social proof toaster
  salesPopEnabled: "social.sales_pop_enabled",
  salesPopIntervalSeconds: "social.sales_pop_interval",
  salesPopDurationSeconds: "social.sales_pop_duration",
  /// One fallback per line: "Name|City|Product|How long ago"
  salesPopFallback: "social.sales_pop_fallback",

  // Floating contact button
  contactFabEnabled: "contact.fab_enabled",
  contactFabLabel: "contact.fab_label",
  contactFabEmail: "contact.fab_email",
  contactFabPhone: "contact.fab_phone",
  contactFabWhatsapp: "contact.fab_whatsapp",

  promoPopupEnabled: "home.promo_popup_enabled",
  promoPopupTitle: "home.promo_popup_title",
  /// Rendered in the accent colour after the title, like "WELCOME **GIFT**".
  promoPopupHighlight: "home.promo_popup_highlight",
  promoPopupEyebrow: "home.promo_popup_eyebrow",
  contactFabLiveChat: "contact.fab_live_chat",
  backupEnabled: "backup.enabled",
  backupKeep: "backup.keep",
  backupTime: "backup.time",
  backupIncludeEnv: "backup.include_env",
  checkoutExitEnabled: "checkout.exit_enabled",
  checkoutExitTitle: "checkout.exit_title",
  checkoutExitBody: "checkout.exit_body",
  checkoutExitCoupon: "checkout.exit_coupon",
  checkoutExitButton: "checkout.exit_button",
  /** Coupon code shown on the cart and checkout with an Apply button. */
  checkoutFeaturedCoupon: "checkout.featured_coupon",
  /** Heading over the checkout upsell block. */
  checkoutUpsellTitle: "checkout.upsell_title",
  promoPopupBody: "home.promo_popup_body",
  promoPopupImage: "home.promo_popup_image",
  promoPopupButton: "home.promo_popup_button",
  promoPopupDismiss: "home.promo_popup_dismiss",
  promoPopupSuccess: "home.promo_popup_success",
  /// Coupon handed out on signup. Must match a real coupon to be usable.
  promoPopupCoupon: "home.promo_popup_coupon",
  promoPopupDelaySeconds: "home.promo_popup_delay_seconds",
  promoPopupHideDays: "home.promo_popup_hide_days",
  promoPopupFrequency: "home.promo_popup_frequency",
  promoPopupHideAfterClaim: "home.promo_popup_hide_after_claim",
  promoPopupShowDismiss: "home.promo_popup_show_dismiss",
  promoPopupShowClose: "home.promo_popup_show_close",

  // Homepage sections
  /*
   * Every homepage section: a show/hide switch and its wording. The titles
   * used to be strings in page.tsx, so a shop could not rename "Daily
   * Discount You'll Love" without a deploy.
   */
  /* Comma-separated section keys, in the order the homepage renders them.
     Any key missing from the saved value is appended in its default place,
     so adding a new section later never leaves it off the page. */
  /* Spin & Win popup. Prizes live in the SpinPrize table; these are the
     things that are not per-prize. */
  spinEnabled: "spin.enabled",
  spinTitle: "spin.title",
  spinSubtitle: "spin.subtitle",
  spinEyebrow: "spin.eyebrow",
  spinFineprint: "spin.fineprint",
  spinDelaySeconds: "spin.delay_seconds",
  /// 0 = one spin per visitor, ever. Otherwise days before it may show again.
  spinRepeatDays: "spin.repeat_days",
  spinEmailRequired: "spin.email_required",
  homeSectionOrder: "home.section_order",
  homeCategoriesEnabled: "home.categories_enabled",
  homeCategoriesTitle: "home.categories_title",
  homeDealsEnabled: "home.deals_enabled",
  homeDealsTitle: "home.deals_title",
  homeDealsSubtitle: "home.deals_subtitle",
  homeBestEnabled: "home.best_enabled",
  homeBestTitle: "home.best_title",
  homeBestSubtitle: "home.best_subtitle",
  homeSelectorEnabled: "home.selector_enabled",
  homePromoEnabled: "home.promo_enabled",
  /// The promo banner that replaced the category cards.
  homeBannerImage: "home.banner_image",
  homeBannerTitle: "home.banner_title",
  homeBannerText: "home.banner_text",
  homeBannerCtaLabel: "home.banner_cta_label",
  homeBannerCtaHref: "home.banner_cta_href",
  /// Comma-separated words for the drifting strip along the banner's foot.
  homeBannerMarquee: "home.banner_marquee",
  homeNewEnabled: "home.new_enabled",
  homeNewTitle: "home.new_title",
  homeNewSubtitle: "home.new_subtitle",
  homeReviewsEnabled: "home.reviews_enabled",
  homeUspEnabled: "home.usp_enabled",
  homeSelectorTitle: "home.selector_title",
  homeSelectorCategories: "home.selector_categories", // comma-separated slugs
  homeReviewsTitle: "home.reviews_title",
  /// Background picture behind the home page review slider.
  homeReviewsImage: "home.reviews_image",
  /// Product page: the delivery estimate under the buy buttons.
  productDeliveryNote: "product.delivery_note",
  /// Product page: the return window under the buy buttons.
  productReturnsNote: "product.returns_note",
  /// Product page: the size chart shown in a dialog. Empty hides the link.
  productSizeGuide: "product.size_guide",
  /// Product page: the "Shipping & Returns" tab. Each <h3> starts a column.
  productShippingTab: "product.shipping_tab",
  /// Product page: the "Return Policies" tab.
  productReturnsTab: "product.returns_tab",
  /// Product page: heading over the spec rows beside the description.
  productCareTitle: "product.care_title",
  /// Product page: show the "N people are viewing this right now" line.
  productViewersLine: "product.viewers_line",
  homeUspTitle: "home.usp_title",
  homeUsps: "home.usps", // "icon|title|text" per line
  homeSignupTitle: "home.signup_title",
  homeSignupBody: "home.signup_body",
  homeSignupEnabled: "home.signup_enabled",
  /// Flash sale strip on the home page (shows whenever a flash deal is live).
  homeFlashHeading: "home.flash_heading",
  homeFlashTitle: "home.flash_title",
  homeFlashSubtitle: "home.flash_subtitle",
  /// Clearance strip on the home page.
  homeClearanceEnabled: "home.clearance_enabled",
  homeClearanceTitle: "home.clearance_title",
  homeClearanceSubtitle: "home.clearance_subtitle",
  /// Show the eyebrow / heading / supporting line above the clearance banner.
  homeClearanceHeading: "home.clearance_heading",
  /// Which homepage the storefront shows: "classic" (the sectioned page) or
  /// "banner" (full-height banner, USP strip, image band). Unset = classic.
  homeLayout: "home.layout",
  /** "br3thr" (the dark storefront: its own header, homepage and footer) or "classic". */
  storeTheme: "store.theme",
  /// Banner homepage design: "framed" | "cinematic" | "bold".
  bannerStyle: "home.banner_style",
  /// Banner homepage: the full-height picture and its one centred button.
  bannerHeroImage: "home.banner_hero_image",
  bannerHeroCtaLabel: "home.banner_hero_cta_label",
  bannerHeroCtaHref: "home.banner_hero_cta_href",
  /// Banner homepage: the band with a background picture and, centred, a
  /// logo, heading, text and an optional button (hidden when unlabelled).
  bannerFeatureImage: "home.banner_feature_image",
  bannerFeatureLogo: "home.banner_feature_logo",
  bannerFeatureTitle: "home.banner_feature_title",
  bannerFeatureText: "home.banner_feature_text",
  bannerFeatureCtaLabel: "home.banner_feature_cta_label",
  bannerFeatureCtaHref: "home.banner_feature_cta_href",

  // Loyalty, mirroring the vicetrip scheme
  loyaltyEnabled: "loyalty.enabled",
  loyaltyEarnRate: "loyalty.earn_rate",       // points per 1 unit of currency
  loyaltyRedeemRate: "loyalty.redeem_rate",   // points per 1 unit of currency
  loyaltySignupBonus: "loyalty.signup_bonus_points",
  loyaltyMinRedeem: "loyalty.min_redeem_points",
  loyaltyMaxDiscountPercent: "loyalty.max_discount_percent",
  loyaltyReferralPoints: "loyalty.referral_points",
  referralMinSpendCents: "referral.min_spend_cents",
  referralFriendDiscountCents: "referral.friend_discount_cents",

  /// Raw CSS appended after the generated theme, so it wins on equal specificity.
  /// Family names of uploaded fonts. Blank means the built-in Public Sans.
  bodyFont: "appearance.body_font",
  headingFont: "appearance.heading_font",
  customCss: "appearance.custom_css",

  // Content translation
  translateEnabled: "translate.enabled",
  translateProvider: "translate.provider",
  translateEndpoint: "translate.endpoint",
  translateApiKey: "translate.api_key",
  translateAutoOnRender: "translate.auto_on_render",
  /// Google's in-browser widget: free, no key, but client-side only.
  translateWidget: "translate.widget",

  // Age verification gate
  ageGateEnabled: "agegate.enabled",
  ageGateMinAge: "agegate.min_age",
  ageGateMode: "agegate.mode", // "confirm" | "dob"
  ageGateTitle: "agegate.title",
  ageGateBody: "agegate.body",
  ageGateConfirmLabel: "agegate.confirm_label",
  ageGateDeclineLabel: "agegate.decline_label",
  ageGateDeclineUrl: "agegate.decline_url",
  ageGateDeclineMessage: "agegate.decline_message",
  ageGateRememberDays: "agegate.remember_days",
  ageGateImage: "agegate.image",
  ageGateFootnote: "agegate.footnote",

  // Barcodes
  barcodeEnabled: "barcode.enabled",
  barcodeFormat: "barcode.format",
  barcodeAutoAssign: "barcode.auto_assign",
  barcodePrefix: "barcode.prefix",
  barcodeShowOnProduct: "barcode.show_on_product",
  barcodeOnSlip: "barcode.on_slip",
  barcodeOnInvoice: "barcode.on_invoice",
  barcodeLabelCopies: "barcode.label_copies",
  barcodeLabelShowPrice: "barcode.label_show_price",
  barcodeLabelShowSku: "barcode.label_show_sku",
  barcodeLabelShowVariant: "barcode.label_show_variant",
  /// "split" puts the name and price on one line above the code, like a shelf
  /// label; "centered" stacks everything.
  barcodeLabelLayout: "barcode.label_layout",
  barcodeLabelColumns: "barcode.label_columns",
  /// A QR on the packing slip, and what it points at.
  barcodeSlipQr: "barcode.slip_qr",
  /// "order" the bare order number | "admin" the staff order page | "track" the
  /// customer's own order page.
  barcodeSlipQrTarget: "barcode.slip_qr_target",
  /// What the code encodes: the generated number, the SKU, or the product link.
  barcodeValueSource: "barcode.value_source",
  /// Length of a generated number, where the symbology does not fix it.
  barcodeAutoDigits: "barcode.auto_digits",
  /// Label sheet design - paper, label box, and what is printed on it.
  barcodeLabelPaper: "barcode.label_paper",
  barcodeLabelWidth: "barcode.label_width",
  barcodeLabelHeight: "barcode.label_height",
  barcodeLabelGap: "barcode.label_gap",
  barcodeLabelMargin: "barcode.label_margin",
  barcodeLabelFont: "barcode.label_font",
  barcodeLabelBorder: "barcode.label_border",
  barcodeLabelRadius: "barcode.label_radius",
  barcodeLabelBarColor: "barcode.label_bar_color",
  barcodeLabelBgColor: "barcode.label_bg_color",
  barcodeLabelTitleCase: "barcode.label_title_case",
  barcodeLabelPricePrefix: "barcode.label_price_prefix",
  barcodeLabelShowStore: "barcode.label_show_store",
  barcodeLabelCustomText: "barcode.label_custom_text",
  barcodeLabelMinimal: "barcode.label_minimal",
  barcodeLabelSort: "barcode.label_sort",
  /// Barcodes inside order emails: the order's own code, and one per item.
  barcodeInEmail: "barcode.in_email",
  barcodeEmailItems: "barcode.email_items",
  adminCustomCss: "appearance.admin_custom_css",

  // Outgoing email (SMTP)
  mailEnabled: "mail.enabled",
  mailHost: "mail.host",
  mailPort: "mail.port",
  mailSecure: "mail.secure",
  mailUser: "mail.user",
  mailPass: "mail.pass",
  mailFromName: "mail.from_name",
  mailFromEmail: "mail.from_email",
  mailReplyTo: "mail.reply_to",
  mailAdminRecipients: "mail.admin_recipients",
  mailSendOrderPlaced: "mail.send_order_placed",
  mailSendPaymentReceived: "mail.send_payment_received",
  mailSendShipped: "mail.send_shipped",
  mailSendWelcomeCode: "mail.send_welcome_code",
  mailSendAdminNewOrder: "mail.send_admin_new_order",
  /// Which customer email carries the PDF invoice: none|placed|paid|shipped|delivered
  mailInvoiceOn: "mail.invoice_on",

  // Security
  secMaxAttempts: "security.max_attempts",
  secWindowMinutes: "security.window_minutes",
  secLockoutMinutes: "security.lockout_minutes",
  // Admin: hard cap per sign-in, and sign-out after this long without use.
  secSessionHours: "security.session_hours",
  secIdleMinutes: "security.idle_minutes",
  // Customer accounts get the same two limits, on a longer scale.
  secCustomerSessionDays: "security.customer_session_days",
  secCustomerIdleHours: "security.customer_idle_hours",
  secAdminIpAllowlist: "security.admin_ip_allowlist",
  secAlertNewIp: "security.alert_new_ip",
  secGeoLookup: "security.geo_lookup",
  secRequire2fa: "security.require_2fa",
  secLogRetentionDays: "security.log_retention_days",
  secThrottleCustomers: "security.throttle_customers",

  // Abandoned cart recovery
  cartRecoveryEnabled: "cart.recovery_enabled",
  cartRecoveryDelayMinutes: "cart.recovery_delay_minutes",
  cartRecoveryMaxReminders: "cart.recovery_max",
  cartRecoveryIntervalHours: "cart.recovery_interval_hours",
  cartRecoveryCoupon: "cart.recovery_coupon",
  cartRecoveryCouponFrom: "cart.recovery_coupon_from",

  // Announcement bar
  announceEnabled: "announce.enabled",
  announceMessages: "announce.messages",
  announceEyebrow: "announce.eyebrow",
  announceCoupon: "announce.coupon",
  announceLinkUrl: "announce.link_url",
  announceLinkLabel: "announce.link_label",
  announceStyle: "announce.style", // "highlight" | "dark" | "custom"
  announceBg: "announce.bg",
  announceFg: "announce.fg",
  announceEndsAt: "announce.ends_at",
  announceDismissible: "announce.dismissible",
  announceHideDays: "announce.hide_days",
  announceRotateSeconds: "announce.rotate_seconds",
  announceLayout: "announce.layout", // "rotate" | "strip"
  announceSticky: "announce.sticky",

  // AI chat assistant
  aiEnabled: "ai.enabled",
  /// "off" | "rules" (free, no API key) | "ai" (Claude, needs a key)
  aiMode: "ai.mode",
  aiApiKey: "ai.api_key",
  /// "anthropic" | "venice"
  aiProvider: "ai.provider",
  aiVeniceKey: "ai.venice_key",
  aiVeniceModel: "ai.venice_model",
  // What the assistant may tell customers about the shop
  aiShareProducts: "ai.share_products",
  aiStockDetail: "ai.stock_detail", // exact | vague | hidden
  aiShareOffers: "ai.share_offers",
  aiShareCoupons: "ai.share_coupons",

  // Shop page header band
  shopHeroTitle: "shop.hero_title",
  shopHeroSubtitle: "shop.hero_subtitle",
  /// Category slugs to show as chips, newline separated. Empty = every category.
  shopHeroCategories: "shop.hero_categories",
  shopHeroShowCounts: "shop.hero_show_counts",
  shopHeroBg: "shop.hero_bg",
  shopHeroText: "shop.hero_text",
  shopHeroImage: "shop.hero_image",
  aiModel: "ai.model",
  aiPersona: "ai.persona",
  aiGreeting: "ai.greeting",
  aiMaxRepliesPerThread: "ai.max_replies_per_thread",
  aiDailyMessageCap: "ai.daily_cap",
  aiAllowOrderLookup: "ai.allow_order_lookup",
  aiAllowPasswordReset: "ai.allow_password_reset",
  aiOfflineOnly: "ai.offline_only",
  aiStaffHoursStart: "ai.staff_hours_start",
  aiStaffHoursEnd: "ai.staff_hours_end",

} as const;

const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.addressLookupEnabled]: "0",
  [SETTING_KEYS.addressGeoapifyKey]: "",
  // Shipped with the site in public/. Saving the field empty hides it.
  // Both ship with the app in /public. The payment one had no default, so
  // the footer fell back to the plain "We accept..." text and the Interac
  // mark never appeared unless someone uploaded it by hand.
  [SETTING_KEYS.footerPaymentLogo]: "/interac-etransfer.png",
  [SETTING_KEYS.footerShippingLogo]: "/canada-post.png",
  // Switches on the footer page; text fields fall back to the translated
  // built-in wording when blank, so they need no default here.
  [SETTING_KEYS.footerLiveChatEnabled]: "1",
  [SETTING_KEYS.footerLanguageEnabled]: "1",
  [SETTING_KEYS.footerWordmarkEnabled]: "1",
  [SETTING_KEYS.footerContactLinkUrl]: "/contact",
  [SETTING_KEYS.storeName]: "Br3thr",
  [SETTING_KEYS.storeTimezone]: "America/Vancouver",
  [SETTING_KEYS.storeTagline]: "",
  [SETTING_KEYS.storeCurrency]: "CAD",
  [SETTING_KEYS.storeLocale]: "en-CA",
  [SETTING_KEYS.contactEmail]: "",
  [SETTING_KEYS.contactPhone]: "",
  [SETTING_KEYS.storeAddress]: "",
  [SETTING_KEYS.logoUrl]: "",
  [SETTING_KEYS.storeBrandMode]: "both",
  [SETTING_KEYS.storeLogoWidth]: "",
  [SETTING_KEYS.giftCardsEnabled]: "1",
  [SETTING_KEYS.headerSearchEnabled]: "1",
  [SETTING_KEYS.headerWishlistEnabled]: "1",
  [SETTING_KEYS.headerAccountEnabled]: "1",
  [SETTING_KEYS.headerSticky]: "1",
  [SETTING_KEYS.headerDrawerButtonEnabled]: "1",
  [SETTING_KEYS.headerDrawerButtonUrl]: "/shop?sale=1",
  [SETTING_KEYS.faviconUrl]: "",
  [SETTING_KEYS.maintenanceMode]: "0",

  [SETTING_KEYS.adminBrandText]: "",
  [SETTING_KEYS.adminLogoUrl]: "",
  [SETTING_KEYS.adminBrandMode]: "both",
  // Logo theme: electric violet, deep ink panels, logo gold.
  [SETTING_KEYS.storefrontPrimary]: "#7B2FF7",
  [SETTING_KEYS.storefrontDark]: "#0D0A1C",
  [SETTING_KEYS.storefrontHighlight]: "#FFC400",
  [SETTING_KEYS.storefrontStyle]: "holo",
  /* "Ocean": a deep blue rail with a lighter blue for actions. The heading
     colour is no longer used by the rail's group labels (those come from the
     rail's own scale in globals.css); it is kept because the Appearance screen
     still exposes all three pickers. */
  /* Black rail, purple accent, white surfaces - the storefront's palette. The
     rail carries a trace of violet rather than being neutral black, so it
     reads as the same family as the accent instead of a grey edge. */
  [SETTING_KEYS.adminSidebarColor]: "#14101C",
  [SETTING_KEYS.adminAccentColor]: "#50119D",
  [SETTING_KEYS.adminHeadingColor]: "#A97BE8",
  [SETTING_KEYS.adminScheme]: "light",

  [SETTING_KEYS.emtRecipientEmail]: "",
  [SETTING_KEYS.emtSecurityQuestion]: "",
  [SETTING_KEYS.emtInstructions]:
    "Send an Interac e-Transfer for the order total to the address above, using your order number as the message.",
  [SETTING_KEYS.emtAutoDeposit]: "1",
  [SETTING_KEYS.emtRecipientName]: "",
  [SETTING_KEYS.emtBankName]: "",
  [SETTING_KEYS.emtMinOrderCents]: "0",
  [SETTING_KEYS.emtMaxOrderCents]: "0",
  [SETTING_KEYS.emtExpiryHours]: "48",
  [SETTING_KEYS.emtTitle]: "Email Money Transfer",
  [SETTING_KEYS.emtDescription]: "Pay via Interac e-Transfer.",
  [SETTING_KEYS.emtUseRandomAnswer]: "1",
  [SETTING_KEYS.emtStaticAnswer]: "",
  [SETTING_KEYS.emtAdjustPercent]: "0",
  [SETTING_KEYS.emtAdjustMessage]: "",
  [SETTING_KEYS.emtAutoCancelDays]: "0",
  [SETTING_KEYS.emtDebugLog]: "0",

  [SETTING_KEYS.portalEnabled]: "0",
  // Deliberately blank - the live endpoint is entered in the admin, not shipped.
  [SETTING_KEYS.portalUrl]: "",
  // The endpoint and both keys live only in the database, never in the repo.
  [SETTING_KEYS.cryptoEndpointUrl]: "",
  [SETTING_KEYS.cryptoCurrency]: "CAD",
  [SETTING_KEYS.cryptoMode]: "test",
  [SETTING_KEYS.cryptoTitle]: "Crypto Payment",
  [SETTING_KEYS.cryptoDescription]: "",
  [SETTING_KEYS.cryptoActive]: "0",
  [SETTING_KEYS.portalToken]: "",
  [SETTING_KEYS.portalSigningSecret]: "",

  [SETTING_KEYS.paypalMode]: "sandbox",
  [SETTING_KEYS.paypalClientId]: "",
  [SETTING_KEYS.paypalSecret]: "",
  [SETTING_KEYS.paypalWebhookId]: "",
  [SETTING_KEYS.paypalCurrency]: "",

  [SETTING_KEYS.bankTransferDetails]: "",
  [SETTING_KEYS.codInstructions]: "",
  [SETTING_KEYS.codMaxOrderCents]: "0",

  [SETTING_KEYS.shippingFlatCents]: "0",
  [SETTING_KEYS.freeShippingOverCents]: "0",
  [SETTING_KEYS.taxPercent]: "0",
  [SETTING_KEYS.taxLabel]: "Tax",
  [SETTING_KEYS.taxNumber]: "",
  [SETTING_KEYS.taxInclusive]: "0",

  [SETTING_KEYS.seoMetaTitle]: "",
  [SETTING_KEYS.seoMetaDescription]: "",
  [SETTING_KEYS.seoOgImage]: "",
  [SETTING_KEYS.seoGaId]: "",
  [SETTING_KEYS.seoSearchConsole]: "",
  [SETTING_KEYS.seoRobots]: "index,follow",
  [SETTING_KEYS.sitemapEnabled]: "1",
  [SETTING_KEYS.sitemapProducts]: "1",
  [SETTING_KEYS.sitemapCategories]: "1",
  [SETTING_KEYS.sitemapPages]: "1",
  [SETTING_KEYS.seoTplProductTitle]: "%%title%% %%sep%% %%sitename%%",
  [SETTING_KEYS.seoTplProductDescription]: "%%excerpt%%",
  [SETTING_KEYS.seoTplCategoryTitle]: "%%title%% %%sep%% %%sitename%%",
  [SETTING_KEYS.seoTplCategoryDescription]: "",
  [SETTING_KEYS.seoTplPostTitle]: "%%title%% %%sep%% %%sitename%%",
  [SETTING_KEYS.seoTplPostDescription]: "%%excerpt%%",
  [SETTING_KEYS.seoTplBlogCategoryTitle]: "%%title%% %%sep%% %%sitename%%",
  [SETTING_KEYS.seoTplBlogCategoryDescription]: "",
  [SETTING_KEYS.seoTplPageTitle]: "%%title%% %%sep%% %%sitename%%",
  [SETTING_KEYS.seoTplPageDescription]: "",
  [SETTING_KEYS.sitemapBlog]: "1",
  [SETTING_KEYS.sitemapBlogCategories]: "1",

  [SETTING_KEYS.heroMode]: "panels",
  [SETTING_KEYS.heroVideoUrl]: "",
  [SETTING_KEYS.heroVideoPoster]: "",
  [SETTING_KEYS.heroBannerSeconds]: "6",
  [SETTING_KEYS.heroTitle]: "",
  [SETTING_KEYS.heroSubtitle]: "",
  [SETTING_KEYS.heroImage]: "",
  [SETTING_KEYS.heroBackground]: "",
  [SETTING_KEYS.heroOverlay]: "light",
  [SETTING_KEYS.heroVideo]: "",
  [SETTING_KEYS.heroCtaLabel]: "",
  [SETTING_KEYS.heroCtaHref]: "",
  [SETTING_KEYS.heroEyebrow]: "",
  [SETTING_KEYS.heroBadgePercent]: "",
  [SETTING_KEYS.heroCard1Title]: "",
  [SETTING_KEYS.heroCard1Subtitle]: "",
  [SETTING_KEYS.heroCard1Image]: "",
  [SETTING_KEYS.heroCard1Href]: "/shop",
  [SETTING_KEYS.heroCard2Title]: "",
  [SETTING_KEYS.heroCard2Subtitle]: "",
  [SETTING_KEYS.heroCard2Image]: "",
  [SETTING_KEYS.heroCard2Href]: "/shop",
  [SETTING_KEYS.categoryStripSubtitle]: "",
  [SETTING_KEYS.salesPopEnabled]: "0",
  [SETTING_KEYS.salesPopIntervalSeconds]: "18",
  [SETTING_KEYS.salesPopDurationSeconds]: "6",
  [SETTING_KEYS.salesPopFallback]:
    "Amelia|Toronto, ON|a bestseller|12 minutes ago\nDaniel|Vancouver, BC|a bestseller|24 minutes ago\nPriya|Calgary, AB|a bestseller|41 minutes ago",

  [SETTING_KEYS.contactFabEnabled]: "0",
  [SETTING_KEYS.contactFabLabel]: "Contact us",
  [SETTING_KEYS.contactFabEmail]: "",
  [SETTING_KEYS.contactFabPhone]: "",
  [SETTING_KEYS.contactFabWhatsapp]: "",

  [SETTING_KEYS.promoPopupEnabled]: "0",
  // always | once | session | days
  [SETTING_KEYS.promoPopupFrequency]: "days",
  [SETTING_KEYS.promoPopupHideAfterClaim]: "1",
  [SETTING_KEYS.promoPopupShowDismiss]: "1",
  [SETTING_KEYS.promoPopupShowClose]: "1",
  [SETTING_KEYS.promoPopupEyebrow]: "One code per email",
  // Off by default: it should not appear until the wording is set.
  [SETTING_KEYS.contactFabLiveChat]: "1",
  [SETTING_KEYS.backupEnabled]: "1",
  // One nightly copy, replacing the previous one.
  [SETTING_KEYS.backupKeep]: "1",
  // Server clock, which is UTC on this host.
  [SETTING_KEYS.backupTime]: "03:17",
  // Off: .env holds the database password and the VAPID private key, and the
  // archive is downloadable.
  [SETTING_KEYS.backupIncludeEnv]: "0",
  [SETTING_KEYS.checkoutExitEnabled]: "0",
  [SETTING_KEYS.checkoutUpsellTitle]: "Frequently bought together",
  [SETTING_KEYS.checkoutExitTitle]: "Wait — your order is nearly done",
  [SETTING_KEYS.checkoutExitBody]:
    "Your cart is saved. Finish now and it ships on the next run.",
  [SETTING_KEYS.checkoutExitCoupon]: "",
  [SETTING_KEYS.checkoutExitButton]: "Finish my order",
  [SETTING_KEYS.promoPopupTitle]: "UNLOCK YOUR WELCOME",
  [SETTING_KEYS.promoPopupHighlight]: "GIFT",
  [SETTING_KEYS.promoPopupBody]: "Join our list and unlock your first-order offer.",
  [SETTING_KEYS.promoPopupImage]: "",
  [SETTING_KEYS.promoPopupButton]: "Choose my gift",
  [SETTING_KEYS.promoPopupDismiss]: "No thanks",
  [SETTING_KEYS.promoPopupSuccess]:
    "You're in. Here's your code — it's waiting at checkout.",
  [SETTING_KEYS.promoPopupCoupon]: "",
  [SETTING_KEYS.promoPopupDelaySeconds]: "4",
  [SETTING_KEYS.promoPopupHideDays]: "30",

  [SETTING_KEYS.spinEnabled]: "0",
  [SETTING_KEYS.spinTitle]: "Spin for up to 20% off",
  [SETTING_KEYS.spinSubtitle]: "Four prizes, every one of them real. Whatever you land on is yours to use at checkout.",
  [SETTING_KEYS.spinEyebrow]: "One spin per customer",
  [SETTING_KEYS.spinFineprint]: "No purchase needed. One spin per visitor. Not stackable with other offers.",
  [SETTING_KEYS.spinDelaySeconds]: "6",
  [SETTING_KEYS.spinRepeatDays]: "0",
  [SETTING_KEYS.spinEmailRequired]: "0",
  [SETTING_KEYS.homeSectionOrder]: "",
  [SETTING_KEYS.homeCategoriesEnabled]: "1",
  [SETTING_KEYS.homeCategoriesTitle]: "Shop by Category",
  [SETTING_KEYS.homeDealsEnabled]: "1",
  [SETTING_KEYS.homeDealsTitle]: "Daily Discount You'll Love",
  [SETTING_KEYS.homeDealsSubtitle]: "Up to 50% off while stock lasts",
  [SETTING_KEYS.homeBestEnabled]: "1",
  [SETTING_KEYS.homeBestTitle]: "Best Selling Products",
  [SETTING_KEYS.homeBestSubtitle]: "The ones that keep going out of the door",
  [SETTING_KEYS.homeSelectorEnabled]: "1",
  [SETTING_KEYS.homePromoEnabled]: "1",
  [SETTING_KEYS.homeBannerImage]: "",
  [SETTING_KEYS.homeBannerTitle]: "Elevate your everyday wellness",
  [SETTING_KEYS.homeBannerText]: "Clean, tested supplements and devices, chosen for people who actually use them.",
  [SETTING_KEYS.homeBannerCtaLabel]: "Shop the range",
  [SETTING_KEYS.homeBannerCtaHref]: "/shop",
  [SETTING_KEYS.homeBannerMarquee]: "New season picks, Trending styles, Limited drops",
  [SETTING_KEYS.homeNewEnabled]: "1",
  [SETTING_KEYS.homeNewTitle]: "Newly Launched Products",
  [SETTING_KEYS.homeNewSubtitle]: "The latest additions to the shelves",
  [SETTING_KEYS.homeReviewsEnabled]: "1",
  [SETTING_KEYS.homeUspEnabled]: "1",
  // Was "Shop by category", which collided with the real category section
  // once this heading became editable - the page showed the phrase twice.
  [SETTING_KEYS.homeSelectorTitle]: "Our Products",
  [SETTING_KEYS.homeSelectorCategories]: "",
  [SETTING_KEYS.homeReviewsTitle]: "What customers say",
  [SETTING_KEYS.homeReviewsImage]: "",
  [SETTING_KEYS.productDeliveryNote]:
    "Estimated Delivery: <b>12-26 Days</b> (International), <b>3-6 Days</b> (Canada)",
  [SETTING_KEYS.productReturnsNote]:
    "Return within <b>45 Days</b> of purchase. Duties &amp; taxes are non-refundable.",
  [SETTING_KEYS.productSizeGuide]: "",
  [SETTING_KEYS.productShippingTab]:
    "<h3>We&rsquo;ve got your back</h3><p>Free returns within 14 days (excludes final sale and made-to-order items).</p>" +
    "<h3>Import duties information</h3><p>Delivery duties are included in the item price when shipping within Canada.</p>" +
    "<h3>Estimated delivery</h3><p>Express: 3-6 business days.</p><p>Sending from Canada.</p>" +
    "<h3>More information?</h3><p>Orders &amp; delivery</p><p>Duties &amp; taxes</p>",
  [SETTING_KEYS.productReturnsTab]:
    "<h3>Return policies</h3><p>If you are not completely satisfied with your purchase, we offer hassle-free returns within 30 days of delivery.</p>" +
    "<h3>What you can do</h3><p>- Exchange your item for a different size, colour or style, or receive a full refund.</p><p>- All returned items must be unworn, in their original packaging, and with tags attached.</p>" +
    "<h3>How it works</h3><p>- Start your return online or contact our customer service team.</p><p>- Pack your item securely and include the original packing slip.</p><p>- Once received, your refund will be processed promptly.</p>",
  [SETTING_KEYS.productCareTitle]: "Composition, Origin and Care Guidelines",
  /* Off unless the shop turns it on: the number is an estimate, not a count of
     real visitors - nothing on this site tracks who is looking at a page. */
  [SETTING_KEYS.productViewersLine]: "0",
  [SETTING_KEYS.homeUspTitle]: "",
  [SETTING_KEYS.homeUsps]:
    "truck|Fast discreet shipping|1-8 Days Xpress Shipping Canada\nshield|Secure e-Transfer|No card details ever touch our servers.\nstar|Quality checked|Every batch is inspected before it ships.\nsupport|Helpful Staff|Experts ready to help",
  [SETTING_KEYS.homeLayout]: "classic",
  [SETTING_KEYS.storeTheme]: "br3thr",
  [SETTING_KEYS.bannerHeroCtaLabel]: "Shop Now",
  [SETTING_KEYS.bannerHeroCtaHref]: "/shop",
  [SETTING_KEYS.homeSignupTitle]: "Join free",
  [SETTING_KEYS.homeSignupBody]:
    "Create an account and we'll drop a welcome bonus into your points balance.",
  [SETTING_KEYS.homeSignupEnabled]: "1",
  [SETTING_KEYS.homeFlashHeading]: "1",
  [SETTING_KEYS.homeFlashTitle]: "Flash Sales",
  [SETTING_KEYS.homeFlashSubtitle]: "Big markdowns for a short time only.",
  [SETTING_KEYS.homeClearanceEnabled]: "0",
  [SETTING_KEYS.homeClearanceTitle]: "Clearance",
  [SETTING_KEYS.homeClearanceSubtitle]: "Last chance on these — once they are gone, they are gone.",
  [SETTING_KEYS.homeClearanceHeading]: "1",

  [SETTING_KEYS.loyaltyEnabled]: "1",
  [SETTING_KEYS.loyaltyEarnRate]: "1",
  // 10 points = $1, so the 300-point signup bonus is worth $30.
  [SETTING_KEYS.loyaltyRedeemRate]: "10",
  [SETTING_KEYS.loyaltySignupBonus]: "1200",
  [SETTING_KEYS.loyaltyMinRedeem]: "10",
  [SETTING_KEYS.loyaltyMaxDiscountPercent]: "100",
  [SETTING_KEYS.loyaltyReferralPoints]: "300",
  [SETTING_KEYS.referralMinSpendCents]: "15000",
  [SETTING_KEYS.referralFriendDiscountCents]: "3000",

  [SETTING_KEYS.bodyFont]: "",
  [SETTING_KEYS.headingFont]: "",
  [SETTING_KEYS.translateEnabled]: "0",
  [SETTING_KEYS.translateProvider]: "none",
  [SETTING_KEYS.translateEndpoint]: "",
  [SETTING_KEYS.translateApiKey]: "",
  [SETTING_KEYS.translateAutoOnRender]: "1",
  [SETTING_KEYS.translateWidget]: "0",

  [SETTING_KEYS.ageGateEnabled]: "0",
  [SETTING_KEYS.ageGateMinAge]: "18",
  [SETTING_KEYS.ageGateMode]: "confirm",
  [SETTING_KEYS.ageGateTitle]: "Are you {age} or older?",
  [SETTING_KEYS.ageGateBody]:
    "You must confirm your age to enter this store.",
  [SETTING_KEYS.ageGateConfirmLabel]: "Yes, I am {age} or older",
  [SETTING_KEYS.ageGateDeclineLabel]: "No, take me back",
  [SETTING_KEYS.ageGateDeclineUrl]: "",
  [SETTING_KEYS.ageGateDeclineMessage]:
    "Sorry — you need to be {age} or older to shop here.",
  [SETTING_KEYS.ageGateRememberDays]: "30",
  [SETTING_KEYS.ageGateImage]: "",
  [SETTING_KEYS.ageGateFootnote]: "",

  [SETTING_KEYS.barcodeEnabled]: "0",
  // EAN-13 is what retail scanners and POS systems expect by default.
  [SETTING_KEYS.barcodeFormat]: "ean13",
  [SETTING_KEYS.barcodeAutoAssign]: "1",
  [SETTING_KEYS.barcodePrefix]: "200",
  [SETTING_KEYS.barcodeLabelShowVariant]: "1",
  [SETTING_KEYS.barcodeLabelLayout]: "split",
  [SETTING_KEYS.barcodeLabelColumns]: "3",
  [SETTING_KEYS.barcodeSlipQr]: "0",
  [SETTING_KEYS.barcodeSlipQrTarget]: "admin",
  [SETTING_KEYS.barcodeShowOnProduct]: "0",
  [SETTING_KEYS.barcodeOnSlip]: "1",
  [SETTING_KEYS.barcodeOnInvoice]: "0",
  [SETTING_KEYS.barcodeLabelCopies]: "1",
  [SETTING_KEYS.barcodeLabelShowPrice]: "1",
  [SETTING_KEYS.barcodeLabelShowSku]: "1",
  [SETTING_KEYS.barcodeValueSource]: "auto",
  [SETTING_KEYS.barcodeAutoDigits]: "12",
  [SETTING_KEYS.barcodeLabelPaper]: "a4",
  [SETTING_KEYS.barcodeLabelWidth]: "60",
  [SETTING_KEYS.barcodeLabelHeight]: "35",
  [SETTING_KEYS.barcodeLabelGap]: "3",
  [SETTING_KEYS.barcodeLabelMargin]: "8",
  [SETTING_KEYS.barcodeLabelFont]: "9",
  [SETTING_KEYS.barcodeLabelBorder]: "1",
  [SETTING_KEYS.barcodeLabelRadius]: "2",
  [SETTING_KEYS.barcodeLabelBarColor]: "#000000",
  [SETTING_KEYS.barcodeLabelBgColor]: "#FFFFFF",
  [SETTING_KEYS.barcodeLabelTitleCase]: "none",
  [SETTING_KEYS.barcodeLabelPricePrefix]: "",
  [SETTING_KEYS.barcodeLabelShowStore]: "0",
  [SETTING_KEYS.barcodeLabelCustomText]: "",
  [SETTING_KEYS.barcodeLabelMinimal]: "0",
  [SETTING_KEYS.barcodeLabelSort]: "name",
  [SETTING_KEYS.barcodeInEmail]: "0",
  [SETTING_KEYS.barcodeEmailItems]: "0",
  [SETTING_KEYS.customCss]: "",
  [SETTING_KEYS.adminCustomCss]: "",

  /*
   * Mail is off until it has been configured and tested, so a half-set-up
   * shop never silently drops customer email into a dead SMTP socket. The
   * Zoho defaults are pre-filled because that is the mailbox this store uses;
   * they are only starting values and can be pointed anywhere.
   */
  [SETTING_KEYS.mailEnabled]: "0",
  // Canadian Zoho region; smtp.zoho.com is the US one and rejects CA logins.
  [SETTING_KEYS.mailHost]: "smtp.zohocloud.ca",
  [SETTING_KEYS.mailPort]: "465",
  [SETTING_KEYS.mailSecure]: "1",
  [SETTING_KEYS.mailUser]: "",
  [SETTING_KEYS.mailPass]: "",
  [SETTING_KEYS.mailFromName]: "",
  [SETTING_KEYS.mailFromEmail]: "",
  [SETTING_KEYS.mailReplyTo]: "",
  [SETTING_KEYS.mailAdminRecipients]: "",
  [SETTING_KEYS.mailSendOrderPlaced]: "1",
  [SETTING_KEYS.mailSendPaymentReceived]: "1",
  [SETTING_KEYS.mailSendShipped]: "1",
  [SETTING_KEYS.mailSendWelcomeCode]: "1",
  [SETTING_KEYS.mailSendAdminNewOrder]: "1",
  [SETTING_KEYS.mailInvoiceOn]: "paid",

  [SETTING_KEYS.secMaxAttempts]: "8",
  [SETTING_KEYS.secWindowMinutes]: "15",
  [SETTING_KEYS.secLockoutMinutes]: "15",
  [SETTING_KEYS.secSessionHours]: "12",
  [SETTING_KEYS.secIdleMinutes]: "30",
  [SETTING_KEYS.secCustomerSessionDays]: "7",
  [SETTING_KEYS.secCustomerIdleHours]: "2",
  [SETTING_KEYS.secAdminIpAllowlist]: "",
  [SETTING_KEYS.secAlertNewIp]: "1",
  [SETTING_KEYS.secGeoLookup]: "1",
  [SETTING_KEYS.secRequire2fa]: "0",
  [SETTING_KEYS.secLogRetentionDays]: "90",
  [SETTING_KEYS.secThrottleCustomers]: "1",

  [SETTING_KEYS.cartRecoveryEnabled]: "0",
  [SETTING_KEYS.cartRecoveryDelayMinutes]: "360", // 6 hours
  [SETTING_KEYS.cartRecoveryMaxReminders]: "2",
  [SETTING_KEYS.cartRecoveryIntervalHours]: "24",
  [SETTING_KEYS.cartRecoveryCoupon]: "",
  [SETTING_KEYS.cartRecoveryCouponFrom]: "2",


  [SETTING_KEYS.announceEnabled]: "0",
  [SETTING_KEYS.announceMessages]: "",
  [SETTING_KEYS.announceEyebrow]: "",
  [SETTING_KEYS.announceCoupon]: "",
  [SETTING_KEYS.announceLinkUrl]: "",
  [SETTING_KEYS.announceLinkLabel]: "",
  [SETTING_KEYS.announceStyle]: "highlight",
  [SETTING_KEYS.announceBg]: "",
  [SETTING_KEYS.announceFg]: "",
  [SETTING_KEYS.announceEndsAt]: "",
  [SETTING_KEYS.announceDismissible]: "1",
  [SETTING_KEYS.announceHideDays]: "1",
  [SETTING_KEYS.announceRotateSeconds]: "6",
  [SETTING_KEYS.announceSticky]: "1",

  [SETTING_KEYS.aiEnabled]: "0",
  [SETTING_KEYS.aiMode]: "off",
  [SETTING_KEYS.aiApiKey]: "",
  [SETTING_KEYS.aiProvider]: "anthropic",
  [SETTING_KEYS.aiVeniceKey]: "",
  [SETTING_KEYS.aiVeniceModel]: "zai-org-glm-4.7-flash",
  [SETTING_KEYS.aiShareProducts]: "1",
  [SETTING_KEYS.aiStockDetail]: "vague",
  [SETTING_KEYS.aiShareOffers]: "1",
  // Off by default: a code given on request is a code given to everyone.
  [SETTING_KEYS.aiShareCoupons]: "0",
  [SETTING_KEYS.aiModel]: "claude-opus-5",
  [SETTING_KEYS.aiPersona]: "",
  [SETTING_KEYS.aiGreeting]:
    "\uD83D\uDC4B Hi there, welcome to %%store%%. I\u2019m Alexa, your AI agent! " +
    "I can help with tracking updates, order questions, and product inquiries.\n\n" +
    "Please choose the option below that best matches your concern.\n\n" +
    "\uD83D\uDCAC Prefer a real person? Just ask to speak with our team!",
  [SETTING_KEYS.aiMaxRepliesPerThread]: "8",
  [SETTING_KEYS.aiDailyMessageCap]: "300",
  [SETTING_KEYS.aiAllowOrderLookup]: "1",
  [SETTING_KEYS.aiAllowPasswordReset]: "1",
  [SETTING_KEYS.aiOfflineOnly]: "0",
  [SETTING_KEYS.aiStaffHoursStart]: "9",
  [SETTING_KEYS.aiStaffHoursEnd]: "17",

  [SETTING_KEYS.shopHeroTitle]: "",
  [SETTING_KEYS.shopHeroSubtitle]: "",
  [SETTING_KEYS.shopHeroCategories]: "",
  [SETTING_KEYS.shopHeroShowCounts]: "1",
  [SETTING_KEYS.shopHeroBg]: "",
  [SETTING_KEYS.shopHeroText]: "",
  [SETTING_KEYS.shopHeroImage]: "",
};

/**
 * Every setting, with the code defaults underneath.
 *
 * Memoised per request. This reads the whole table, and a single page can ask
 * for it a dozen times over - the layout, the money formatter, the time zone,
 * the announcement bar, each feature flag. React's cache() collapses those
 * into one query per request while still picking up a change on the next one,
 * so nothing goes stale.
 */
export const getSettings = cache(
  async (): Promise<Record<string, string>> => {
    const rows = await prisma.storeSetting.findMany();
    const map: Record<string, string> = { ...DEFAULTS };
    for (const row of rows) map[row.key] = row.value;
    return map;
  },
);

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.storeSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function setSettings(entries: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(entries).map(([key, value]) => setSetting(key, value)),
  );
}
