# Storefront Motion Implementation Plan

> Executed natively (superpowers:executing-plans). Spec: docs/superpowers/specs/2026-10-10-storefront-motion-design.md

**Global constraints:** storefront only; reduced motion = no motion; only
transform/opacity; no CLS; pointer:fine for hover effects; deploy checks the
server build exit code before restarting.

### Task 1: Dependency + controller skeleton + no-flash CSS
- `npm i gsap`; `src/components/store/StorefrontMotion.tsx` (client, renders
  null; `useEffect` keyed on pathname; `gsap.registerPlugin(ScrollTrigger)`;
  `gsap.context` + revert; adds `nl-motion-live`).
- Inline pre-paint script + CSS in `globals.css` (`.nl-motion` hide targets,
  2.5s fallback, `.nl-motion-live` cancels fallback + CSS card lift).
- Mount in `src/app/(storefront)/layout.tsx`.
- Verify: page renders, nothing stuck hidden, reduced motion = static.

### Task 2: Scroll reveals
- Selectors: `main section h2`, `.nl-card` (batched per grid), `[data-reveal]`.
- Mark USP band, PromoBanner, reviews section, footer columns `data-reveal`.
- Verify: scroll the home page and shop; cards cascade; once only.

### Task 3: Hero entrance
- `data-hero="line|text|cta|stage"` in HeroShowcase; timeline on load.
- Verify: plays once on load, no jump, float keeps working.

### Task 4: Hover + micro-interactions
- Card tilt; `data-magnetic` on AddToCartButton + hero CTA; `data-add-to-cart`
  bounce on submit; `data-cart-icon` on MiniCart trigger, shake on `?added=1`.
- Verify with real mouse hover; off on touch emulation.

### Task 5: Parallax + marquee
- `data-parallax` on hero background span and PromoBanner image wrapper.
- GSAP marquee with velocity timeScale; CSS marquee paused under `.nl-motion-live`.
- Verify: scrubbed movement, marquee speeds up on fast scroll.

### Task 6: Full verification + preview + deploy (after user approves preview)
