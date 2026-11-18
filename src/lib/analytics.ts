"use client";

/**
 * One place that fans a shop event out to every tag that happens to be loaded.
 *
 * Each destination is optional and guarded: a store with only Meta configured
 * must not throw because gtag is undefined, and none of this may ever break a
 * page. Failures are swallowed deliberately - an ad blocker removing fbq is
 * the normal case, not an error worth surfacing to a shopper.
 */

type Item = {
  id: string;
  name: string;
  price: number; // major units, e.g. 9.83
  quantity: number;
  variant?: string | null;
};

type Payload = {
  value?: number;
  currency?: string;
  items?: Item[];
  /** Order number, for purchase de-duplication at the tag end. */
  transactionId?: string;
  coupon?: string | null;
};

type W = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: (...args: unknown[]) => void;
  ttq?: { track: (name: string, data?: unknown) => void };
};

/** GA4 / Meta / TikTok each name the same moment differently. */
const NAMES: Record<
  string,
  { ga: string; meta?: string; tiktok?: string }
> = {
  view_item: { ga: "view_item", meta: "ViewContent", tiktok: "ViewContent" },
  add_to_cart: { ga: "add_to_cart", meta: "AddToCart", tiktok: "AddToCart" },
  view_cart: { ga: "view_cart" },
  begin_checkout: {
    ga: "begin_checkout",
    meta: "InitiateCheckout",
    tiktok: "InitiateCheckout",
  },
  purchase: { ga: "purchase", meta: "Purchase", tiktok: "CompletePayment" },
};

export function track(event: keyof typeof NAMES | string, payload: Payload = {}) {
  if (typeof window === "undefined") return;
  const w = window as W;
  const map = NAMES[event] ?? { ga: event };
  const currency = payload.currency ?? "CAD";

  // GTM: always push, so a container can build its own tags from this.
  try {
    w.dataLayer = w.dataLayer ?? [];
    w.dataLayer.push({ event: map.ga, ecommerce: { ...payload, currency } });
  } catch {
    /* never break the page for a tag */
  }

  try {
    w.gtag?.("event", map.ga, {
      currency,
      value: payload.value,
      transaction_id: payload.transactionId,
      coupon: payload.coupon ?? undefined,
      items: payload.items?.map((i) => ({
        item_id: i.id,
        item_name: i.name,
        item_variant: i.variant ?? undefined,
        price: i.price,
        quantity: i.quantity,
      })),
    });
  } catch {
    /* ignore */
  }

  if (map.meta) {
    try {
      w.fbq?.("track", map.meta, {
        currency,
        value: payload.value,
        content_type: "product",
        content_ids: payload.items?.map((i) => i.id),
        contents: payload.items?.map((i) => ({
          id: i.id,
          quantity: i.quantity,
          item_price: i.price,
        })),
        // Meta de-duplicates server/browser events on this id.
        ...(payload.transactionId ? { order_id: payload.transactionId } : {}),
      });
    } catch {
      /* ignore */
    }
  }

  if (map.tiktok) {
    try {
      w.ttq?.track(map.tiktok, {
        currency,
        value: payload.value,
        contents: payload.items?.map((i) => ({
          content_id: i.id,
          content_name: i.name,
          quantity: i.quantity,
          price: i.price,
        })),
      });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Fire an event at most once for a given key, surviving a remount or a
 * refresh. Used for `purchase`, which must never double-count revenue if
 * someone reloads the confirmation page.
 */
export function trackOnce(key: string, event: string, payload: Payload = {}) {
  try {
    const seen = window.sessionStorage.getItem(key);
    if (seen === "1") return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Storage blocked: fire anyway rather than lose the conversion entirely.
  }
  track(event, payload);
}
