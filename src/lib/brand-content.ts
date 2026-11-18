/**
 * Everything the Br3thr storefront says that is not shop data: the menu,
 * the homepage copy and the footer columns. Kept in one file so the wording
 * can be changed without touching any layout.
 */

export const GF = {
  name: "Br3thr",
  logo: "/br3thr/logo-480.png",
  logoLarge: "/br3thr/logo.png",
  tagline: "Premium products for those who appreciate the finer things in life. Quality. Style. Tradition.",
} as const;

/** Is the Br3thr design switched on? Anything but an explicit "classic" is. */
export function isBr3thrTheme(saved: string | null | undefined): boolean {
  return saved?.trim() !== "classic";
}

export type GfNavItem = {
  label: string;
  href: string;
  /**
   * What fills the dropdown: a category slug (its sub-categories), "*" (every
   * top-level category) or "@brand" (the values of the Brand attribute).
   */
  dropdown?: string;
  /** Links set under this item in Admin → Header; they replace the automatic dropdown. */
  children?: { label: string; href: string; newTab?: boolean }[];
  newTab?: boolean;
};

export const GF_NAV: GfNavItem[] = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Cigars", href: "/shop?category=cigars", dropdown: "cigars" },
  { label: "Lighters", href: "/shop?category=lighters", dropdown: "lighters" },
  { label: "Accessories", href: "/shop?category=accessories", dropdown: "accessories" },
  { label: "Gifts & Sets", href: "/shop?category=gift-sets", dropdown: "gift-sets" },
  { label: "Lifestyle", href: "/shop?category=lifestyle", dropdown: "lifestyle" },
  { label: "Brands", href: "/shop?brand=all", dropdown: "@brand" },
];

/** The thin bar above the header. "{free}" becomes the free-shipping threshold. */
export const GF_TOPBAR = {
  left: "Free shipping on orders over {free}",
  centre: "Live like a Br3thr",
  right: ["Premium Quality", "Exclusive Collections"],
} as const;

export const GF_SHOP_HERO = {
  line1: "Shop the",
  line2: "Collection",
  text: "Premium cigars, luxury accessories and a lifestyle built for those who lead differently.",
  image: "/br3thr/shop-hero.jpg",
  badges: [
    { icon: "diamond", label: "Premium\nQuality" },
    { icon: "truck", label: "Canada-wide\nShipping" },
    { icon: "crown", label: "Exclusive\nCollections" },
  ],
} as const;

export const GF_HERO = {
  eyebrow: "Premium Products",
  line1: "Live like a",
  line2: "Br3thr",
  text: "Exclusive collection for those who appreciate the finer things in life.",
  cta: { label: "Shop Now", href: "/shop" },
  image: "/br3thr/hero.jpg",
  badges: [
    { icon: "diamond", label: "Premium\nQuality" },
    { icon: "truck", label: "Fast & Secure\nShipping" },
    { icon: "shield", label: "100% Secure\nPayment" },
  ],
} as const;

/** Shown when a category has no photo of its own; cycled by position. */
export const GF_CATEGORY_FALLBACKS = [
  "/br3thr/cat-1.jpg",
  "/br3thr/cat-2.jpg",
  "/br3thr/cat-3.jpg",
  "/br3thr/cat-4.jpg",
];

export const GF_PROMO = {
  eyebrow: "Limited Time Offer",
  title: "Premium Cigars",
  highlight: "Up to 30% off",
  text: "Discover our exclusive selection of premium cigars.",
  cta: { label: "Shop Cigars", href: "/shop?sale=1" },
  image: "/br3thr/promo.jpg",
} as const;

export const GF_FEATURES = [
  { icon: "leaf", title: "Premium Quality", text: "Carefully selected products" },
  { icon: "truck", title: "Canada-wide Shipping", text: "Fast & reliable delivery" },
  { icon: "shield", title: "Secure Payment", text: "Your data is always safe" },
  { icon: "headset", title: "Expert Support", text: "We're here to help" },
] as const;

/** Used only until the shop has approved reviews of its own. */
export const GF_TESTIMONIALS = [
  {
    body: "Exceptional quality and service. The cigars are absolutely phenomenal! Will definitely order again.",
    name: "Michael R.",
  },
  {
    body: "Best cigar accessories I've ever purchased. The quality is unmatched and the shipping was fast.",
    name: "David L.",
  },
  {
    body: "A true premium experience. The gift set was perfect and beautifully packaged.",
    name: "James T.",
  },
];

export const GF_CLUB = {
  titleStart: "Join the",
  titleAccent: "Br3thr",
  titleEnd: "Club",
  text: "Get exclusive offers, early access to new arrivals and members-only deals.",
  placeholder: "Enter your email address",
  button: "Subscribe",
  left: "/br3thr/club-left.jpg",
  right: "/br3thr/club-right.jpg",
} as const;

export const GF_FOOTER_COLUMNS = [
  {
    title: "Shop",
    links: [
      { label: "All Products", href: "/shop" },
      { label: "Cigars", href: "/shop?category=cigars" },
      { label: "Lighters", href: "/shop?category=lighters" },
      { label: "Accessories", href: "/shop?category=accessories" },
      { label: "Gift Sets", href: "/shop?category=gift-sets" },
      { label: "Lifestyle", href: "/shop?category=lifestyle" },
    ],
  },
  {
    title: "Customer Care",
    links: [
      { label: "Track Your Order", href: "/track-order" },
      { label: "Shipping Information", href: "/pages/shipping-policy" },
      { label: "Returns & Exchanges", href: "/pages/refund-policy" },
      { label: "FAQ", href: "/pages/faq" },
      { label: "Contact Us", href: "/contact" },
    ],
  },
  {
    title: "About",
    links: [
      { label: "Our Story", href: "/pages/about" },
      { label: "The Br3thr Club", href: "/account/register" },
      { label: "Blog", href: "/blog" },
      { label: "Size Guide", href: "/pages/size-guide" },
      { label: "Terms & Conditions", href: "/pages/terms" },
      { label: "Privacy Policy", href: "/pages/privacy-policy" },
    ],
  },
] as const;

export const GF_SOCIALS = [
  { icon: "facebook", label: "Facebook", href: "#" },
  { icon: "instagram", label: "Instagram", href: "#" },
  { icon: "x", label: "X", href: "#" },
  { icon: "youtube", label: "YouTube", href: "#" },
] as const;

/** Trust lines under the buy buttons and in the strip below the product. */
export const GF_PRODUCT_TRUST = [
  { icon: "shield", title: "Secure Payment", text: "SSL Encrypted" },
  { icon: "truck", title: "Canada-wide Shipping", text: "Tracked & Insured" },
  { icon: "shield", title: "Premium Quality", text: "Hand Selected" },
  { icon: "gift", title: "Gift Ready", text: "Luxury Packaging" },
] as const;

export const GF_PRODUCT_STRIP = [
  { icon: "leaf", title: "Premium Craftsmanship", text: "Hand-selected, exceptional quality." },
  { icon: "truck", title: "Canada-wide Shipping", text: "Delivered anywhere in Canada." },
  { icon: "shield", title: "Secure Payment", text: "100% encrypted checkout." },
  { icon: "gift", title: "Gift-Ready Packaging", text: "A perfect gift for special occasions." },
] as const;

export const GF_PRODUCT_QUOTE = {
  text: "A fine cigar turns a moment into a memory.",
  by: "The Br3thr",
  image: "/br3thr/hero.jpg",
} as const;

export const GF_CARE_GUIDE =
  "Store cigars at 65-70% humidity and 18-21°C, away from direct sunlight. Keep leather and wood pieces dry and wipe them with a soft cloth. Polish metal accessories gently and keep lighters away from heat.";

/** Common questions on every product page; the full list lives on the FAQ page. */
export const GF_PRODUCT_FAQ = [
  { q: "What is included with this product?", a: "Everything listed in the description and specifications is included. Gift sets arrive fully packed and ready to give." },
  { q: "Is this a good gift for a special occasion?", a: "Yes. Choose luxury gift packaging at checkout where offered and we can include a personal note." },
  { q: "Do you ship internationally?", a: "No. We ship within Canada only, with tracked, insured delivery. Delivery times and costs are shown at checkout." },
  { q: "What is your return policy?", a: "Unopened items can be returned within the return window shown on the Shipping & Returns tab. Contact us and we will arrange it." },
] as const;
