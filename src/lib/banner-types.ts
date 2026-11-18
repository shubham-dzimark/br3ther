/**
 * What every banner-homepage design receives. The page works the copy out
 * (translations, fallbacks, picture URLs); a design only lays it out.
 */
export type BannerUsp = { icon: string; title: string; text: string };

export type BannerPageProps = {
  hero: { image: string | null; ctaLabel: string; ctaHref: string };
  /** Empty when the USP section is switched off. */
  usps: BannerUsp[];
  feature: {
    image: string | null;
    logo: string | null;
    title: string;
    text: string;
    /** Empty means no button. */
    ctaLabel: string;
    ctaHref: string;
  };
};

export type BannerStyle = "framed" | "cinematic" | "bold";

/** The saved design; anything unknown is the first one. */
export function bannerStyle(saved: string | null | undefined): BannerStyle {
  const v = saved?.trim();
  return v === "cinematic" || v === "bold" ? v : "framed";
}
