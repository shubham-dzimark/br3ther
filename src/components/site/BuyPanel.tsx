"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { buyNow } from "@/app/(site)/checkout-actions";
import { TubScene, FLAVOUR_LIDS } from "./TubScene";

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
}: {
  variants: Variant[];
  flavours: string[];
  sizes: string[];
  defaultVariantId: string;
  gateways: Gateway[];
  error: string | null;
  prefill: { email: string; name: string };
}) {
  const start = variants.find((v) => v.id === defaultVariantId) ?? variants[0];
  const [flavour, setFlavour] = useState(start.flavour);
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

  return (
    <section id="buy" className="buy sec" aria-labelledby="buy-title" tabIndex={-1}>
      <div className="grid12 buy__grid">
        <div className="buy__visual">
          <div className="tubbox">
            <TubScene
              flavour={flavour}
              detail={`${size.toUpperCase()}  ·  ${Math.round((parseInt(size, 10) || 300) / 10)} SERVINGS`}
              className="tubcanvas"
              idleSpin
            />
          </div>
          <p className="caption small muted">
            {flavour} · {size}. The lid changes with the flavour; the tub stays black.
          </p>
        </div>

        <form className="buy__form" action={buyNow}>
          <h2 id="buy-title" className="h2" data-split>Take it home</h2>
          <p className="lead">One tub ships in a plain box. Pay by e-Transfer or crypto once the order is in.</p>

          {error && ERRORS[error] ? (
            <p className="notice" role="alert">{ERRORS[error]}</p>
          ) : null}

          <fieldset className="choice">
            <legend>Flavour</legend>
            <div className="choice__opts">
              {flavours.map((f) => (
                <label className="opt" key={f}>
                  <input type="radio" name="flavour" value={f} checked={flavour === f} onChange={() => setFlavour(f)} />
                  <span>
                    <i className="swatch" style={{ background: FLAVOUR_LIDS[f] ?? "#ecece8" }} aria-hidden="true" />
                    {f}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="choice">
            <legend>Size</legend>
            <div className="choice__opts">
              {sizes.map((s) => {
                const v = variants.find((x) => x.flavour === flavour && x.size === s);
                const out = !v || v.available === 0;
                return (
                  <label className="opt" key={s}>
                    <input type="radio" name="size" value={s} checked={size === s} disabled={out} onChange={() => setSize(s)} />
                    <span>
                      {s}
                      {v ? <small className="muted">{money(v.priceCents)}</small> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="choice">
            <legend>Quantity</legend>
            <div className="qty">
              <button type="button" aria-label="One fewer" onClick={() => setQty(Math.max(1, q - 1))} disabled={q <= 1}>−</button>
              <output aria-live="polite">{q}</output>
              <button type="button" aria-label="One more" onClick={() => setQty(Math.min(maxQty, q + 1))} disabled={q >= maxQty}>+</button>
            </div>
          </fieldset>

          <input type="hidden" name="variantId" value={variant?.id ?? ""} />
          <input type="hidden" name="quantity" value={q} />
          <input type="hidden" name="shipCountry" value="CA" />

          <div className="total">
            <span>Total before shipping</span>
            <span className="amount" aria-live="polite">{variant ? money(variant.priceCents * q) : "—"}</span>
          </div>

          <fieldset className="choice">
            <legend>Where it goes</legend>
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
                <label htmlFor="b-phone">Phone (optional)</label>
                <input id="b-phone" name="phone" type="tel" autoComplete="tel" />
              </div>
              <div className="field full">
                <label htmlFor="b-l1">Street address</label>
                <input id="b-l1" name="shipLine1" autoComplete="address-line1" required />
              </div>
              <div className="field full">
                <label htmlFor="b-l2">Apartment, unit (optional)</label>
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
          </fieldset>

          <fieldset className="choice">
            <legend>Payment</legend>
            {gateways.length === 0 ? (
              <p className="notice">Payments are switched off right now. Please check back soon.</p>
            ) : (
              <div className="pay">
                {gateways.map((g) => (
                  <label className="opt" key={g.key}>
                    <input
                      type="radio"
                      name="paymentMethodKey"
                      value={g.key}
                      defaultChecked={g.key === firstPay}
                      disabled={!g.available}
                      required
                    />
                    <span>
                      {g.title}
                      <small>{g.available ? g.description || "" : g.reason}</small>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <Submit disabled={soldOut || gateways.every((g) => !g.available)} label={variant ? `Place order · ${money(variant.priceCents * q)}` : "Sold out"} />
          <p className="buy__fine small muted">
            Shipping is added to the order and shown on your receipt before you pay. Nothing is charged until you send the payment.
          </p>
        </form>
      </div>
    </section>
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
