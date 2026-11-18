/**
 * The storefront header and footer styles, chosen in Admin > Header and
 * Admin > Footer. Anything but the explicit alternative is the full version,
 * so a stray value can never strip the shop's navigation.
 */
export type HeaderStyle = "full" | "simple";
export type FooterStyle = "full" | "copyright";

export function headerStyle(saved: string | null | undefined): HeaderStyle {
  return saved?.trim() === "simple" ? "simple" : "full";
}

export function footerStyle(saved: string | null | undefined): FooterStyle {
  return saved?.trim() === "copyright" ? "copyright" : "full";
}
