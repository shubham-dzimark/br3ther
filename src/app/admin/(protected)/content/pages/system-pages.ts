/**
 * Plain module, not a "use server" file: server-action files may only export
 * async functions, so shared constants have to live outside them.
 */
export const SYSTEM_PAGES = [
  { slug: "faq", title: "FAQ" },
  { slug: "privacy-policy", title: "Privacy Policy" },
  { slug: "terms", title: "Terms & Conditions" },
  { slug: "shipping-policy", title: "Shipping Policy" },
  { slug: "refund-policy", title: "Refund Policy" },
] as const;
