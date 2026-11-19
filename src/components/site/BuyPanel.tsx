"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { buyNow } from "@/app/(site)/checkout-actions";
import { TubScene } from "./TubScene";
import { useFlavour } from "./Flavour";
import { SplitHeading } from "./Reveal";
import { AnimatedAmount } from "./Sections";

type Variant = { id: string; flavour: string; size: string; priceCents: number; available: number };
type Gateway = { key: string; title: string; description: string; available: boolean; reason: string | null };

const PROVINCES = [
  ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"], ["NT", "Northwest Territories"],
  ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"],
  ["SK", "Saskatchewan"], ["YT", "Yukon"],
] as const;

const ERRORS: Record<string, string> = {
  missing: "Some details are missing. Check your email, name and address, then place the order again.",
  stock: "That option has just sold out. Pick another flavour or size.",
  payment: "Choose how you'd like to pay.",
  limits: "e-Transfer isn't available for this total. Try a smaller quantity or pay with crypto.",
  crypto_init: "Crypto payment couldn't be set up just now. Try again in a minute, or pay by e-Transfer.",
  giftcard: "That gift card can't be used on this order.",
};

const money = (cents: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);

export function BuyPanel({
  variants,
  flavours,
  sizes,
  defaultVariantId,
  gateways,
  error,
  prefill,
  title,
  lede,
}: {
  variants: Variant[];
  flavours: string[];
  sizes: string[];
  defaultVariantId: string;
  gateways: Gateway[];
  error: string | null;
  prefill: { email: string; name: string };
  title: string;
  lede: string;
}) {
  const start = variants.find((v) => v.id === defaultVariantId) ?? variants[0];
  // Shared with the hero: the flavour chosen there is the one in the basket.
  const { flavour: shared, setFlavour, look } = useFlavour();
  const flavour = flavours.includes(shared) ? shared : start.flavour;
  const [size, setSize] = useState(start.size);
  const [qty, setQty] = useState(1);

  const variant = useMemo(
    () => variants.find((v) => v.flavour === flavour && v.size === size) ?? null,
    [variants, flavour, size],
  );
  const soldOut = !variant || variant.available === 0;
  const maxQty = Math.max(1, Math.min(10, variant?.available ?? 1));
  const q = Math.min(qty, maxQty);
  const firstPay = gateways.find((g) => g.available)?.key ?? "";

  const servings = (sz: string) => Math.round((parseInt(sz, 10) || 300) / 10);
  const perScoop = (v: Variant) => money(Math.round(v.priceCents / servings(v.size)));
  const cheapestPerScoop = Math.min(
    ...sizes.map((s) => {
      const v = variants.find((x) => x.flavour === flavour && x.size === s);
      return v ? v.priceCents / servings(s) : Infinity;
    }),
  );
  const months = (s: string) => servings(s) / 30;
  const total = variant ? money(variant.priceCents * q) : "—";

  return (
    <section id="buy" className="buy sec" aria-labelledby="buy-title" tabIndex={-1}>
      <div className="buy__head">
        <div>
          <p className="kicker">Checkout</p>
          <SplitHeading id="buy-title" className="poster buy__title" text={title} />
        </div>
        <p className="buy__lede">{lede}</p>
      </div>

      <div className="buy__grid">
        {/* left: the product and the order so far, in view while the form scrolls */}
        <aside className="buy__side" aria-label="Your order">
          <div className="buy__stage" style={{ background: look(flavour).ground }}>
            <span className="pagehead__rings buy__rings" aria-hidden="true" />
            <span className="buy__chip">No.3 · {flavour} · {size}</span>
            <div className="tubbox">
              <TubScene
                flavour={flavour}
                lid={look(flavour).lid}
                detail={`${size.toUpperCase()}  ·  ${servings(size)} SERVINGS`}
                className="tubcanvas"
                idleSpin
              />
            </div>
          </div>

          <div className="summary">
            <div className="summary__item">
              <span className="summary__dot" style={{ background: look(flavour).lid }} aria-hidden="true" />
              <span className="summary__what">
                <b>No.3 Daily Blend</b>
                <small>
                  {flavour} · {size} · {q} {q === 1 ? "tub" : "tubs"}
                </small>
              </span>
              <span className="summary__price">{total}</span>
            </div>
            <dl className="summary__rows">
              <div>
                <dt>Per scoop</dt>
                <dd>{variant ? perScoop(variant) : "—"}</dd>
              </div>
              <div>
                <dt>Shipping</dt>
                <dd>Added on your receipt</dd>
              </div>
            </dl>
            <div className="summary__total">
              <span>Total before shipping</span>
              <AnimatedAmount value={total} />
            </div>
          </div>

          <ul className="assure">
            <li><AssureIcon name="lock" />Nothing is charged until you send the payment</li>
            <li><AssureIcon name="truck" />Ships anywhere in Canada, tracked</li>
            <li><AssureIcon name="mail" />Receipt and tracking number by email</li>
          </ul>
        </aside>

        {/* right: three steps */}
        <form className="buy__form" action={buyNow}>
          {error && ERRORS[error] ? (
            <p className="notice" role="alert">{ERRORS[error]}</p>
          ) : null}

          <input type="hidden" name="variantId" value={variant?.id ?? ""} />
          <input type="hidden" name="quantity" value={q} />
          <input type="hidden" name="shipCountry" value="CA" />

          <section className="step" aria-labelledby="step-blend">
            <h3 id="step-blend" className="step__title"><span className="step__n">01</span>Your blend</h3>

            <fieldset className="choice">
              <legend>Flavour</legend>
              <div className="cards cards--3">
                {flavours.map((f) => (
                  <label className="card" key={f}>
                    <input type="radio" name="flavour" value={f} checked={flavour === f} onChange={() => setFlavour(f)} />
                    <span className="card__in">
                      <span className="card__swatch" style={{ background: look(f).ground }} aria-hidden="true">
                        <i style={{ background: look(f).lid }} />
                      </span>
                      <span className="card__name">{f}</span>
                      <Check />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="choice">
              <legend>Size</legend>
              <div className="cards cards--2">
                {sizes.map((s) => {
                  const v = variants.find((x) => x.flavour === flavour && x.size === s);
                  const out = !v || v.available === 0;
                  const best = Boolean(v) && sizes.length > 1 && v!.priceCents / servings(s) === cheapestPerScoop;
                  return (
                    <label className="card" key={s}>
                      <input type="radio" name="size" value={s} checked={size === s} disabled={out} onChange={() => setSize(s)} />
                      <span className="card__in card__in--size">
                        {best ? <span className="card__badge">Best value</span> : null}
                        <span className="card__size">{s}</span>
                        <span className="card__meta">
                          {servings(s)} scoops{months(s) >= 1 ? ` · ${months(s)} month${months(s) > 1 ? "s" : ""}` : ""}
                        </span>
                        <span className="card__price">{v ? money(v.priceCents) : "—"}</span>
                        <span className="card__meta">{out ? "Sold out" : v ? `${perScoop(v)} a scoop` : ""}</span>
                        <Check />
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="qtyrow">
              <span className="qtyrow__label" id="qty-label">Quantity</span>
              <div className="qty" role="group" aria-labelledby="qty-label">
                <button type="button" aria-label="One fewer" onClick={() => setQty(Math.max(1, q - 1))} disabled={q <= 1}>−</button>
                <output aria-live="polite">{q}</output>
                <button type="button" aria-label="One more" onClick={() => setQty(Math.min(maxQty, q + 1))} disabled={q >= maxQty}>+</button>
              </div>
            </div>
          </section>

          <section className="step" aria-labelledby="step-ship">
            <h3 id="step-ship" className="step__title"><span className="step__n">02</span>Delivery</h3>
            <div className="fields">
              <div className="field full">
                <label htmlFor="b-email">Email</label>
                <input id="b-email" name="email" type="email" autoComplete="email" required defaultValue={prefill.email} />
              </div>
              <div className="field">
                <label htmlFor="b-name">Full name</label>
                <input id="b-name" name="shipName" autoComplete="name" required defaultValue={prefill.name} />
              </div>
              <div className="field">
                <label htmlFor="b-phone">Phone <span className="opt-label">optional</span></label>
                <input id="b-phone" name="phone" type="tel" autoComplete="tel" />
              </div>
              <div className="field full">
                <label htmlFor="b-l1">Street address</label>
                <input id="b-l1" name="shipLine1" autoComplete="address-line1" required />
              </div>
              <div className="field full">
                <label htmlFor="b-l2">Apartment, unit <span className="opt-label">optional</span></label>
                <input id="b-l2" name="shipLine2" autoComplete="address-line2" />
              </div>
              <div className="field">
                <label htmlFor="b-city">City</label>
                <input id="b-city" name="shipCity" autoComplete="address-level2" required />
              </div>
              <div className="field">
                <label htmlFor="b-prov">Province</label>
                <select id="b-prov" name="shipRegion" autoComplete="address-level1" required defaultValue="">
                  <option value="" disabled>Choose</option>
                  {PROVINCES.map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="b-post">Postal code</label>
                <input id="b-post" name="shipPostalCode" autoComplete="postal-code" required />
              </div>
            </div>
          </section>

          <section className="step" aria-labelledby="step-pay">
            <h3 id="step-pay" className="step__title"><span className="step__n">03</span>Payment</h3>
            {gateways.length === 0 ? (
              <p className="notice">Payments are switched off right now. Please check back soon.</p>
            ) : (
              <div className="cards cards--pay">
                {gateways.map((g) => (
                  <label className="card" key={g.key}>
                    <input
                      type="radio"
                      name="paymentMethodKey"
                      value={g.key}
                      defaultChecked={g.key === firstPay}
                      disabled={!g.available}
                      required
                    />
                    <span className="card__in card__in--pay">
                      <span className="card__radio" aria-hidden="true" />
                      <span>
                        <span className="card__name">{g.title}</span>
                        <span className="card__meta">{g.available ? g.description || "" : g.reason}</span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            <Submit disabled={soldOut || gateways.every((g) => !g.available)} label={variant ? `Place order · ${total}` : "Sold out"} />
            <p className="buy__fine small muted">
              Shipping is added to the order and shown on your receipt before you pay. Nothing is charged until you send the payment.
            </p>
          </section>
        </form>
      </div>
    </section>
  );
}

function Check() {
  return (
    <span className="card__check" aria-hidden="true">
      <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

function AssureIcon({ name }: { name: "lock" | "truck" | "mail" }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className="assure__icon" aria-hidden="true">
      {name === "lock" && <><rect {...p} x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path {...p} d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>}
      {name === "truck" && <><path {...p} d="M3 6.5h11v9H3z" /><path {...p} d="M14 9.5h4l3 3v3h-7" /><circle {...p} cx="7" cy="17.5" r="1.8" /><circle {...p} cx="17" cy="17.5" r="1.8" /></>}
      {name === "mail" && <><rect {...p} x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path {...p} d="M4 7l8 6 8-6" /></>}
    </svg>
  );
}

function Submit({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn buy__submit" disabled={disabled || pending} aria-busy={pending}>
      {pending ? "Placing your order…" : label}
    </button>
  );
}
