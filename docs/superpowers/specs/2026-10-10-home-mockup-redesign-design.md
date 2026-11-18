# Home page redesign to the supplied mockup — design

Date: 2026-10-10. Approved in chat ("show me preview" after the sectioned design).

## Intent
Rebuild the storefront home page and the site header to match the user's full-page
mockup as closely as possible. Footer unchanged. Real products, categories, reviews and
admin-uploaded images replace the mockup's stock photos. Everything stays editable in
Home page control / Admin › Header.

## Decisions (from the user)
- Header changes site-wide to the mockup's dark two-row header.
- Headings: the mockup's wide heavy upper-case face (Archivo, width 125%, weight 800)
  replaces Nosifer everywhere, Spin & Win included.
- Product card: the mockup card everywhere (badge, heart, image, name, stars + count,
  price + struck compare-at, full-width black "Add to Cart"). No variation chips, no
  quantity box. Variable products: Add to Cart adds the first in-stock variant.
- Sections not in the mockup (Our Products tabs, promo banner, flash, clearance) are
  switched off but kept, re-enable in Home page control.

## Page (top to bottom)
1. Header: dark top bar (free-shipping text left, "Premium Quality • Discreet Packaging •
   Trusted by Thousands" centre, Canada flag + "CAD $" label right); dark main bar (logo,
   centred menu from Admin › Header, search / account / cart icons).
2. Hero: dark scene (admin background), eyebrow, two-line headline with purple accent,
   text, purple "Shop Now →" + outlined "View Categories", trust row of 4 icons
   (setting `home.hero_trust`, "icon|label" lines), product image in a glowing purple ring.
3. Shop by *Category*: 6 pastel tiles (category image, name, "Shop Now →"), pill link.
4. Daily Discounts: countdown (flash deal end, else midnight America/Toronto), 5 cards.
5. Reward points band: dark image band, "SPECIAL OFFER", "GET *$20 CAD* IN REWARD
   POINTS" (real bonus), purple Create Account + outlined Learn More.
6. Best Selling: 5 cards + pill link.
7. Why Choose *Yayo Bros*: dark band, 4 round outline icons from the USP list.
8. New Arrivals: 5 cards + pill link.
9. What Our Customers Say: 3 review cards (stars, quote, avatar, name, "Verified
   Customer"), arrows + dots, real reviews.
10. Newsletter band (new): dark image band, eyebrow, title, text, email + purple Subscribe,
    same newsletter list as the footer form.
11. Footer: unchanged.

## Shared pieces
- `src/lib/accent.ts` + `AccentText`: `*word*` in admin text renders purple.
- `SectionPanel`: eyebrow, accented title, subtitle, right-hand pill or `aside`.
- New settings: per-section eyebrows, usp/reviews subtitles, signup eyebrow + image,
  flash on/off, hero trust row, newsletter band (on/off, eyebrow, title, text, image).
  Band images fall back to the hero background.
- Section order default follows the mockup; `newsletter` added.

## Colours
Page ground light lavender-white; white cards with soft shadow; purple (`--brand`) for
accents and the three marketing buttons (Shop Now, Create Account, Subscribe); Add to Cart
stays black everywhere.

## Testing
Unit tests for accent parsing and first-in-stock variant pick; full suite, tsc, build;
browser preview at desktop / tablet / phone against the mockup; add to cart from a simple
and a variable product. Go-live only after the user sees the preview; at go-live switch
off selector/promo/flash/clearance and set the section order in live settings.
