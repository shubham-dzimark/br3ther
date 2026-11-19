import type { Metadata } from "next";
import Image from "next/image";
import { getSiteProduct } from "@/lib/site-product";
import { checkoutGateways } from "@/lib/payment-gateways";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { getSessionUser } from "@/lib/auth";
import { Hero } from "@/components/site/Hero";
import { BuyPanel } from "@/components/site/BuyPanel";
import { Inside } from "@/components/site/Inside";
import { FlavourProvider } from "@/components/site/Flavour";
import { Reveal, RevealItem, SplitHeading } from "@/components/site/Reveal";
import { SiteHeader, BuyBar } from "@/components/site/Chrome";
import { Footer } from "@/components/site/Footer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "BR3THR · No.3 Daily Blend" },
  description: "One tub, thirty scoops, one month. No.3 Daily Blend from Br3thr, shipped across Canada.",
};

const money = (cents: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(cents / 100);

const FAQ: [string, string][] = [
  ["How do I pay?", "By Interac e-Transfer or crypto. Place the order and the next screen shows exactly where to send the money, the amount and the reference. Nothing is charged before that."],
  ["Where do you ship, and how fast?", "Anywhere in Canada. The order is packed once the payment lands, and the tracking number comes to your email the day it ships."],
  ["How much is shipping?", "It is worked out from your address and added to the order. You see the full total on your receipt before you send the payment."],
  ["What if I miss a day?", "Nothing happens. Take the next scoop the next day; one tub still lasts about a month."],
  ["Can I change or cancel an order?", "Yes, until it ships. Reply to the confirmation email or write to help@br3thr.com with your order number."],
  ["How do I follow my order?", "Use Track order with your order number and email, or sign in to see every order you've placed."],
];

const HOW = [
  { title: "Day one", text: "One level scoop, 10 g, into 300 ml of cold water. Shake for twenty seconds until it’s clear.", img: "/site/stairs-cc0.webp", alt: "White concrete steps climbing a sunlit wall" },
  { title: "Week one", text: "Same time every day. Most people take it in the morning, before anything else, so it never gets skipped.", img: "/site/photo-134.jpg", alt: "A steel truss bridge seen from below" },
  { title: "Day thirty", text: "Thirty scoops and one empty tub. Order the next one in the last week and it arrives before you run out.", img: "/site/photo-693.jpg", alt: "A suspension bridge tower rising out of fog above cliffs" },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, product, customer, admin] = await Promise.all([
    searchParams,
    getSiteProduct(),
    getCurrentCustomer(),
    getSessionUser().catch(() => null),
  ]);

  const fromCents = product ? Math.min(...product.variants.map((v) => v.priceCents)) : 4900;
  const price = money(fromCents);
  const gateways = product
    ? await checkoutGateways({ subtotalCents: fromCents, isAdmin: Boolean(admin) })
    : [];

  const defaultFlavour = product?.variants.find((v) => v.id === product.defaultVariantId)?.flavour;

  return (
    <FlavourProvider flavours={product?.flavours ?? ["Unflavoured", "Black cherry", "Citrus salt"]} initial={defaultFlavour}>
      <a href="#main" className="sr-only">Skip to content</a>
      <SiteHeader signedIn={Boolean(customer)} />
      <main id="main">
        <Hero price={price} />

        <Inside />

        {/* ---- one product ---- */}
        <section className="sec statement" aria-labelledby="intro-title">
          <SplitHeading id="intro-title" className="kicker-head" text="One product" />
          <Reveal className="statement__grid">
            <RevealItem as="p" className="statement__text">
              Br3thr makes one thing: a tub you finish in a month and reorder without thinking, because the scoop, the
              mix and the taste never change.
            </RevealItem>
            <RevealItem as="figure" className="statement__photo">
              <Image src="/site/photo-855.jpg" alt="A person walking past a tall white corrugated wall" width={1600} height={1000} sizes="(max-width: 760px) 92vw, 40vw" style={{ objectPosition: "85% 50%" }} />
            </RevealItem>
            <RevealItem as="p" className="statement__note muted">
              The name is short for brother. The 3 stands in for the letters you skip when you say it fast, and it is the
              number on the tub. Brothers share what works; this is the thing worth sharing.
            </RevealItem>
          </Reveal>
        </section>

        {/* ---- how to ---- */}
        <section id="how" className="sec how" aria-labelledby="how-title" tabIndex={-1}>
          <SplitHeading id="how-title" className="poster how__head" text="How to take it" />
          <Reveal as="ol" className="how__cards">
            {HOW.map((h, i) => (
              <RevealItem as="li" key={h.title} className="how__card">
                <span className="how__num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <figure className="how__photo">
                  <Image src={h.img} alt={h.alt} width={1200} height={900} sizes="(max-width: 760px) 92vw, 30vw" />
                </figure>
                <h3>{h.title}</h3>
                <p>{h.text}</p>
              </RevealItem>
            ))}
          </Reveal>
        </section>

        {product ? (
          <BuyPanel
            variants={product.variants}
            flavours={product.flavours}
            sizes={product.sizes}
            defaultVariantId={product.defaultVariantId}
            gateways={gateways}
            error={error ?? null}
            prefill={{ email: customer?.email ?? "", name: customer?.name ?? "" }}
          />
        ) : (
          <section id="buy" className="buy sec" aria-labelledby="buy-title">
            <h2 id="buy-title" className="h2">Back soon</h2>
            <p className="lead">No.3 is not on sale at the moment.</p>
          </section>
        )}

        {/* ---- questions ---- */}
        <section id="faq" className="sec faq" aria-labelledby="faq-title" tabIndex={-1}>
          <div className="grid12">
            <SplitHeading id="faq-title" className="poster faq__head" text="Questions before you buy" />
            <Reveal className="faq__list">
              {FAQ.map(([q, a]) => (
                <RevealItem key={q}>
                  <details>
                    <summary>
                      {q}
                      <svg className="chev" viewBox="0 0 14 14" aria-hidden="true">
                        <path d="M2 5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </summary>
                    <p>{a}</p>
                  </details>
                </RevealItem>
              ))}
            </Reveal>
          </div>
        </section>

        {/* ---- close ---- */}
        <section className="close on-dark" aria-labelledby="close-title">
          <SplitHeading id="close-title" className="poster close__head" text="Same scoop. Every day." />
          <div className="close__foot">
            <p>One tub lasts a month. Order today and the first scoop is on its way this week.</p>
            <a className="btn btn--light" href="#buy">
              Buy No.3 · {price} <span className="arrow" aria-hidden="true">→</span>
            </a>
          </div>
        </section>
      </main>
      <Footer signedIn={Boolean(customer)} />
      <BuyBar price={price} />
    </FlavourProvider>
  );
}
