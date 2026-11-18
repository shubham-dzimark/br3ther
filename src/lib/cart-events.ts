/*
 * Opening the slide-out cart from anywhere on the page.
 *
 * A normal add redirects back with ?added=1 and the mini-cart opens on that.
 * Adds that stay on the page - the "Frequently bought together" button calls a
 * server action without navigating - have no URL to change, so they announce
 * the add with this event instead.
 */
export const CART_OPEN_EVENT = "nl:cart-open";

export function openMiniCart(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CART_OPEN_EVENT));
}
