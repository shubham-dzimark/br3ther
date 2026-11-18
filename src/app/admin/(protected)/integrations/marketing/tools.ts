/**
 * Plain module, not a "use server" file: server-action files may only export
 * async functions, so this list has to live outside actions.ts.
 */
export const MARKETING_TOOLS = [
  {
    key: "marketing.ga",
    label: "Google Analytics 4",
    placeholder: "G-XXXXXXXXXX",
    blurb: "Page views, traffic sources and conversions on the storefront.",
  },
  {
    key: "marketing.gtm",
    label: "Google Tag Manager",
    placeholder: "GTM-XXXXXXX",
    blurb: "Container for managing other tags without code changes.",
  },
  {
    key: "marketing.google_ads",
    label: "Google Ads",
    placeholder: "AW-XXXXXXXXX",
    blurb: "Conversion tracking for Google Ads campaigns.",
  },
  {
    key: "marketing.meta_pixel",
    label: "Meta Pixel",
    placeholder: "123456789012345",
    blurb: "Facebook and Instagram ad attribution and retargeting.",
  },
  {
    key: "marketing.tiktok",
    label: "TikTok Pixel",
    placeholder: "CXXXXXXXXXXXXXXXXXXX",
    blurb: "TikTok ad attribution and audience building.",
  },
  {
    key: "marketing.hotjar",
    label: "Hotjar",
    placeholder: "1234567",
    blurb: "Session recordings and heatmaps for the storefront.",
  },
] as const;
