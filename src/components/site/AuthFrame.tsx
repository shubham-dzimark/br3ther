import Link from "next/link";
import { getSiteContent, lookOf } from "@/lib/site-content";
import { getSiteProduct } from "@/lib/site-product";
import { siteFontVariables } from "@/lib/site-fonts";
import { WordSvg, BR3THR } from "./Wordmark";
import { SplitHeading } from "./Reveal";
import { TubScene } from "./TubScene";
import "./site.css";

/*
 * The staff sign-in screens (password, then two-step code) in the shop's
 * design: the left half on the default flavour's colour with the hero's rings,
 * the wordmark and the 3D tub turning slowly; the right half white, with a
 * poster title and the form. On a phone the coloured half becomes a band.
 */
export async function AuthFrame({
  kicker,
  title,
  lede,
  children,
  foot,
}: {
  kicker: string;
  title: string;
  lede: React.ReactNode;
  children: React.ReactNode;
  foot?: React.ReactNode;
}) {
  const [content, product] = await Promise.all([getSiteContent(), getSiteProduct().catch(() => null)]);
  const flavour =
    product?.variants.find((v) => v.id === product.defaultVariantId)?.flavour ?? product?.flavours[0] ?? "Unflavoured";
  const look = lookOf(content, flavour);

  return (
    <div className={`site authframe ${siteFontVariables}`} style={{ ["--ground" as string]: look.ground }}>
      <section className="authframe__art" aria-hidden="true">
        <span className="pagehead__rings" />
        <Link href="/" className="authframe__mark" tabIndex={-1}>
          <WordSvg letters={BR3THR} />
        </Link>
        <div className="authframe__tub">
          <TubScene flavour={flavour} lid={look.lid} className="authframe__canvas" idleSpin interactive={false} />
        </div>
        <p className="authframe__tag poster">Orders, stock and support for No.3.</p>
      </section>

      <main className="authframe__sheet">
        <div className="authframe__box">
          <p className="kicker">{kicker}</p>
          <SplitHeading as="h1" className="poster authframe__title" text={title} />
          <p className="authframe__lede muted">{lede}</p>
          {children}
          {foot ? <div className="authframe__foot small muted">{foot}</div> : null}
        </div>
      </main>
    </div>
  );
}
