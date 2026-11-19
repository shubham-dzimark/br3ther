import { siteFontVariables } from "@/lib/site-fonts";
import { getSiteContent, lookOf } from "@/lib/site-content";
import { getSiteProduct } from "@/lib/site-product";
import { SiteLoader } from "@/components/site/Loader";
import "@/components/site/site.css";

/*
 * The one-page Br3thr site and its follow-up pages; fonts in
 * src/lib/site-fonts.ts. The website loader covers every full load in the
 * default flavour's colour.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [content, product] = await Promise.all([getSiteContent(), getSiteProduct().catch(() => null)]);
  const flavour =
    product?.variants.find((v) => v.id === product.defaultVariantId)?.flavour ?? product?.flavours[0] ?? "Unflavoured";
  return (
    <div className={`site ${siteFontVariables}`}>
      <SiteLoader ground={lookOf(content, flavour).ground} />
      {children}
    </div>
  );
}
