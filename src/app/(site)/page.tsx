import type { Metadata } from "next";
import Image from "next/image";
import { getSiteProduct } from "@/lib/site-product";
import { checkoutGateways } from "@/lib/payment-gateways";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { getSessionUser } from "@/lib/auth";
import { Hero } from "@/components/site/Hero";
import { BuyPanel } from "@/components/site/BuyPanel";
import { Inside } from "@/components/site/Inside";
import { Motion } from "@/components/site/Motion";
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

  return (
    <>
      <a href="#main" className="sr-only">Skip to content</a>
      <SiteHeader signedIn={Boolean(customer)} />
      <main id="main">
        <Hero price={price} />

        {/* ---- one product ---- */}
        <section className="sec intro" aria-labelledby="intro-title">
          <div className="grid12" data-reveal>
            <h2 id="intro-title" className="h2 intro__head" data-split>One product</h2>
            <p className="intro__text" data-r>
              Br3thr makes one thing: a tub you finish in a month and reorder without thinking, because the scoop, the
              mix and the taste never change.
            </p>
            <figure className="intro__photo" data-r data-drift style={{ overflow: "hidden" }}>
              <Image src="/site/photo-855.jpg" alt="A person walking past a tall white corrugated wall" width={1600} height={1000} sizes="(max-width: 760px) 70vw, 33vw" style={{ objectPosition: "85% 50%" }} />
            </figure>
            <p className="intro__note muted" data-r>
              The name is short for brother. The 3 stands in for the letters you skip when you say it fast, and it is the
              number on the tub. Brothers share what works; this is the thing worth sharing.
            </p>
          </div>
        </section>

        {/* ---- the band ---- */}
        <section className="sec" aria-labelledby="band-title">
          <h2 id="band-title" className="h2 band__head" data-split>Every day starts somewhere</h2>
          <div className="band" data-shutter>
            <figure style={{ ["--g" as string]: 5 }}>
              <Image src="/site/photo-1033.jpg" alt="An empty concourse with two escalators under a skylight" width={1600} height={1000} sizes="45vw" />
              <figcaption className="band__title">Early, before anyone else</figcaption>
            </figure>
            <figure style={{ ["--g" as string]: 2 }}>
              <Image src="/site/photo-508.jpg" alt="Pointed vaults and pale columns of a church interior" width={1200} height={1500} sizes="18vw" />
            </figure>
            <figure style={{ ["--g" as string]: 3 }}>
              <Image src="/site/photo-677.jpg" alt="Four tower corners framing a cross of bright sky" width={1600} height={1200} sizes="27vw" />
            </figure>
            <figure style={{ ["--g" as string]: 2 }}>
              <Image src="/site/photo-520.jpg" alt="A suspension bridge tower between brick buildings" width={1200} height={1500} sizes="18vw" />
            </figure>
          </div>
          <p className="band__cap muted">Same scoop at home, at the gym and on the road. The tub travels; the habit stays.</p>
        </section>

        <Inside />

        {/* ---- how to ---- */}
        <section id="how" className="sec how" aria-labelledby="how-title" tabIndex={-1}>
          <div className="grid12" data-reveal>
            <h2 id="how-title" className="h2 how__head" data-split>How to take it</h2>
            <figure className="how__p1" data-r data-drift style={{ overflow: "hidden" }}>
              <Image src="/site/stairs-cc0.webp" alt="White concrete steps climbing a sunlit wall" width={1024} height={683} sizes="(max-width: 760px) 100vw, 33vw" />
            </figure>
            <p className="how__t1" data-r>
              <b>On the first day,</b> take one level scoop, 10 g, into 300 ml of cold water. Shake for twenty seconds until
              it&rsquo;s clear.
            </p>
            <figure className="how__p2" data-r style={{ overflow: "hidden" }}>
              <Image src="/site/photo-134.jpg" alt="A steel truss bridge seen from below" width={1200} height={1500} sizes="(max-width: 760px) 62vw, 25vw" />
            </figure>
            <p className="how__t2" data-r>
              <b>A week later,</b> it&rsquo;s the same time every day. Most people take it in the morning, before anything
              else, so it never gets skipped.
            </p>
            <figure className="how__p3" data-r data-drift style={{ overflow: "hidden" }}>
              <Image src="/site/photo-693.jpg" alt="A suspension bridge tower rising out of fog above cliffs" width={1600} height={1000} sizes="(max-width: 760px) 78vw, 42vw" />
            </figure>
            <p className="how__t3" data-r>
              <b>By the end,</b> thirty scoops and one empty tub. Order the next one in the last week and it arrives before
              you run out.
            </p>
          </div>
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
            <h2 id="faq-title" className="h2 faq__head" style={{ gridColumn: "1 / -1" }} data-split>
              Questions before you buy
            </h2>
            <div className="faq__list">
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>
                    {q}
                    <svg className="chev" viewBox="0 0 14 14" aria-hidden="true">
                      <path d="M2 5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---- close ---- */}
        <section className="close on-dark" aria-labelledby="close-title">
          <h2 id="close-title" className="display close__head" data-split>Same scoop. Every day.</h2>
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
      <Motion />
    </>
  );
}
