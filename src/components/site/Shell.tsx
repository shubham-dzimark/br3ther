import { getCurrentCustomer } from "@/lib/customer-auth";
import { checkoutGateways } from "@/lib/payment-gateways";
import { getSiteContent, lookOf } from "@/lib/site-content";
import { getSiteProduct } from "@/lib/site-product";
import { SiteHeader } from "./Chrome";
import { Footer } from "./Footer";
import { Reveal, RevealItem, SplitHeading } from "./Reveal";

/*
 * The follow-up pages (receipt, crypto payment, order tracking, account,
 * unsubscribe) in the homepage's design: the same header and footer, a title
 * band on the default flavour's colour (set in Admin > Home Page Control) with
 * the hero's rings, a poster title that rises in word by word, and rounded
 * panels underneath.
 */
export async function Shell({ children }: { children: React.ReactNode }) {
  const [customer, content, product, gateways] = await Promise.all([
    getCurrentCustomer(),
    getSiteContent(),
    getSiteProduct().catch(() => null),
    checkoutGateways({ subtotalCents: 4900, isAdmin: false }).catch(() => []),
  ]);
  const flavour =
    product?.variants.find((v) => v.id === product.defaultVariantId)?.flavour ?? product?.flavours[0] ?? "Unflavoured";
  const look = lookOf(content, flavour);
  const payments = gateways.map((g) => (g.key === "emt" ? "Interac e-Transfer" : g.key === "crypto" ? "Crypto" : g.title));

  return (
    <>
      <a href="#main" className="sr-only">Skip to content</a>
      <SiteHeader signedIn={Boolean(customer)} />
      <main id="main" className="page" style={{ ["--ground" as string]: look.ground, ["--lid" as string]: look.lid }}>
        <div className="page__inner">{children}</div>
      </main>
      <Footer signedIn={Boolean(customer)} payments={payments.length ? payments : undefined} />
    </>
  );
}

/**
 * The title band at the top of a follow-up page. `aside` sits at the right of
 * the band (e.g. the account page's Sign out); `kicker` is the small line above
 * the title.
 */
export function PageHead({
  title,
  lede,
  kicker,
  aside,
}: {
  title: string;
  lede?: React.ReactNode;
  kicker?: string;
  aside?: React.ReactNode;
}) {
  return (
    <header className="pagehead">
      <span className="pagehead__rings" aria-hidden="true" />
      <div className="pagehead__inner">
        <div className="pagehead__text">
          {kicker ? <p className="kicker pagehead__kicker">{kicker}</p> : null}
          <SplitHeading as="h1" className="poster pagehead__title" text={title} />
          {lede ? (
            <Reveal>
              <RevealItem as="p" className="pagehead__lede">{lede}</RevealItem>
            </Reveal>
          ) : null}
        </div>
        {aside ? <div className="pagehead__aside">{aside}</div> : null}
      </div>
    </header>
  );
}

/** A labelled input in the site's style. */
export function Field({
  label, name, type = "text", autoComplete, required = true, defaultValue, hint,
}: {
  label: string; name: string; type?: string; autoComplete?: string; required?: boolean; defaultValue?: string; hint?: string;
}) {
  const id = `f-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} autoComplete={autoComplete} required={required} defaultValue={defaultValue} aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint ? <p id={`${id}-hint`} className="small muted" style={{ marginTop: 6 }}>{hint}</p> : null}
    </div>
  );
}
