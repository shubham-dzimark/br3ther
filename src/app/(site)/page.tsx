import type { Metadata } from "next";
import { getSiteProduct } from "@/lib/site-product";
import { checkoutGateways } from "@/lib/payment-gateways";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { getSessionUser } from "@/lib/auth";
import { Hero } from "@/components/site/Hero";
import { BuyPanel } from "@/components/site/BuyPanel";
import { Inside } from "@/components/site/Inside";
import { FlavourProvider } from "@/components/site/Flavour";
import { SplitHeading } from "@/components/site/Reveal";
import { Faq } from "@/components/site/Faq";
import { Traveller } from "@/components/site/Traveller";
import { CloseBand, HowSteps, Statement } from "@/components/site/Sections";
import { fillPay, getSiteContent, lookOf, payPhrase } from "@/lib/site-content";
import { SiteHeader, BuyBar } from "@/components/site/Chrome";
import { Footer } from "@/components/site/Footer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "BR3THR · No.3 Daily Blend" },
  description: "One tub, thirty scoops, one month. No.3 Daily Blend from Br3thr, shipped across Canada.",
};

const money = (cents: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(cents / 100);



export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, product, customer, admin, content] = await Promise.all([
    searchParams,
    getSiteProduct(),
    getCurrentCustomer(),
    getSessionUser().catch(() => null),
    getSiteContent(),
  ]);

  const fromCents = product ? Math.min(...product.variants.map((v) => v.priceCents)) : 4900;
  const price = money(fromCents);
  const gateways = product
    ? await checkoutGateways({ subtotalCents: fromCents, isAdmin: Boolean(admin) })
    : [];

  const defaultFlavour = product?.variants.find((v) => v.id === product.defaultVariantId)?.flavour;
  const flavours = product?.flavours ?? ["Unflavoured", "Black cherry", "Citrus salt"];
  const looks = Object.fromEntries(flavours.map((f) => [f, lookOf(content, f)]));
  // Copy that names payment methods follows what checkout actually offers.
  const payKeys = gateways.map((g) => g.key);
  const pay = payPhrase(payKeys);
  const payNames = payKeys.map((k) => (k === "emt" ? "Interac e-Transfer" : k === "crypto" ? "Crypto" : k));

  return (
    <FlavourProvider flavours={flavours} initial={defaultFlavour} looks={looks}>
      <a href="#main" className="sr-only">Skip to content</a>
      <SiteHeader signedIn={Boolean(customer)} />
      <main id="main">
        <Hero price={price} lede={content.hero.lede} />

        <Traveller />
        <Inside title={content.inside.title} steps={content.inside.steps} note={content.inside.note} />

        <Statement
          title={content.statement.title}
          text={content.statement.text}
          note={content.statement.note}
          img="/site/photo-855.jpg"
          alt="A person walking past a tall white corrugated wall"
        />

        <HowSteps title={content.how.title} steps={content.how.steps} />

        {product ? (
          <BuyPanel
            variants={product.variants}
            flavours={product.flavours}
            sizes={product.sizes}
            defaultVariantId={product.defaultVariantId}
            gateways={gateways}
            error={error ?? null}
            prefill={{ email: customer?.email ?? "", name: customer?.name ?? "" }}
            title={content.buy.title}
            lede={fillPay(content.buy.lede, pay)}
          />
        ) : (
          <section id="buy" className="buy sec" aria-labelledby="buy-title">
            <h2 id="buy-title" className="h2">Back soon</h2>
            <p className="lead">No.3 is not on sale at the moment.</p>
          </section>
        )}

        {/* ---- questions ---- */}
        <section id="faq" className="sec faq" aria-labelledby="faq-title" tabIndex={-1}>
          <div className="faq__grid">
            <div className="faq__side">
              <p className="kicker">Questions</p>
              <SplitHeading id="faq-title" className="poster faq__head" text={content.faq.title} />
              <p className="faq__help muted">
                Still unsure? Write to us and a person answers, usually the same day.
              </p>
              <p className="faq__links">
                <a className="btn" href="mailto:help@br3thr.com">Email help@br3thr.com</a>
                <a className="btn btn--ghost" href="/track-order">Track an order</a>
              </p>
            </div>
            <Faq items={content.faq.items.map(({ q, a }) => ({ q, a: fillPay(a, pay) }))} />
          </div>
        </section>

        <CloseBand title={content.close.title} text={content.close.text} cta={`Buy No.3 · ${price}`} />
      </main>
      <Footer signedIn={Boolean(customer)} payments={payNames.length ? payNames : undefined} />
      <BuyBar price={price} />
    </FlavourProvider>
  );
}
