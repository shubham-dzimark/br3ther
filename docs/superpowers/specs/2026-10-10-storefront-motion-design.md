# Storefront Motion (GSAP) — Design

Date: 2026-10-10 · Approved in chat ("go ahead") · Store: yayobros.st

## Goal
Add GSAP-driven motion to the storefront: scroll reveals, hero entrance,
hover/micro-interactions, parallax + scroll-reactive marquee. Admin untouched.

## Architecture
- Dependencies: `gsap` (+ ScrollTrigger plugin, bundled).
- One client controller `StorefrontMotion` mounted once in the storefront
  layout. It finds elements by selector / `data-*` attributes and builds a
  `gsap.context()` per route; reverts and rebuilds on every pathname change.
  No page is converted to a client component.
- Reduced motion (`prefers-reduced-motion: reduce`) or no JS: no animation,
  everything visible.

## Effects
1. **Scroll reveals** — section headings (`main section h2`), product cards
   (`.nl-card`, staggered 0.08s per grid), `[data-reveal]` blocks (USP band,
   promo banner, reviews, footer columns). y 28px → 0, opacity 0 → 1,
   0.7s power3.out, once, start "top 88%".
2. **Hero entrance** — `[data-hero]` parts on load: lines (stagger 0.12s,
   y 40 → 0), text, CTA (scale 0.92 → 1), stage (y 30, scale 0.96 → 1).
   ~1.2s total. The existing CSS float on `.nl-hero-float` is left alone.
3. **Hover** (pointer: fine only) — `.nl-card` 3D tilt toward cursor
   (max 6°, perspective 900), replacing the CSS hover lift;
   `[data-magnetic]` buttons pull toward cursor (max 8px), spring back.
   `[data-add-to-cart]` gets a bounce on submit; header `[data-cart-icon]`
   shakes when the page loads with `?added=1`.
4. **Parallax** — `[data-parallax]` containers move their image
   (yPercent −8 → 8, scale 1.16, scrubbed). **Marquee** — `.nl-marquee-track`
   is driven by GSAP (same speed) and its timeScale follows scroll velocity,
   easing back to 1.

## No-flash rule
An inline script adds `nl-motion` to `<html>` before paint (only if motion is
allowed). CSS hides reveal targets under `.nl-motion` and shows them again
via a 2.5s fallback animation. When the controller starts it adds
`nl-motion-live`, which cancels the fallback (CSS animations override inline
styles, so it must be off) and the CSS card hover lift.

## Testing
Browser checks (desktop + 375px): reveals fire on scroll, hero plays once,
tilt/magnetic only with mouse, bounce + shake after add-to-cart, parallax and
marquee react, route change rebuilds (no stuck hidden content), reduced motion
shows everything static, no console errors, no horizontal overflow.
`npm test` stays green; tsc + build clean; server build checked before restart.
