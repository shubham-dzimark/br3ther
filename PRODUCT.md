# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Shop staff** using the admin panel at `/admin`. The schema defines the roles OWNER, STORE_MANAGER, ACCOUNTANT, EDITOR and CUSTOMER_SERVICE, and each role sees only its capabilities.
- **Shoppers** using the storefront.
- Open: who on the team uses the admin daily, and whether mainly on desktop or phone, is not decided. Until it is, treat desktop as primary and keep every screen fully usable on a phone.

## Product Purpose
Br3thr is an online shop. The planned storefront is a single-page website selling a single product, with a dummy product in place for now. The admin panel is where the team runs every part of the shop: orders and payment confirmation, catalogue and stock, customer support, and marketing and content.

## Operating Context
- Order handling covers manual payment confirmation (crypto and EMT bank transfer), order statuses, shipping, carriers, printed documents and refunds.
- Catalogue work covers products, variants, attributes, inventory, barcodes and labels, bulk pricing and bundles.
- Support work covers the live-chat inbox (with email replies), tickets, an AI assistant, a knowledge base and reviews.
- Marketing and content covers coupons, gift cards, flash sales, upsells, the promo popup, the announcement bar, spin-to-win, homepage, header and footer content, the blog, the newsletter, SEO, loyalty points and referrals.
- Admin security uses optional TOTP two-factor login, session limits and IP-based login throttling.

## Capabilities and Constraints
- Stack: Next.js 16 (App Router), React 19, Tailwind CSS 4, Prisma 7, PostgreSQL.
- The admin has 84 routes under `src/app/admin/(protected)`, and access is gated per role.
- The current redesign is visual only. Every existing feature, field, route, server action and permission must keep working unchanged.
- The storefront is redesigned separately, later.

## Brand Commitments
- Name: Br3thr (BR3THR in all caps). The previous brand, "Godfather", is retired. Its logo and artwork in `public/br3thr/` are placeholders to be replaced.
- Binding visual constraint from the owner: the theme is built on black and white. Matching accent colours are welcome where they make it look better; black and white stays the base.

## Evidence on Hand
- The catalogue is demo data only (health and wellness items plus a gift card). No real product, customers, testimonials or metrics exist, and none may be invented.
- No real domain exists yet; `br3thr.com` is a placeholder.

## Product Principles
1. The admin is a working tool: speed and clarity in daily tasks come before decoration.
2. Never lose function in the name of design. Every existing capability stays reachable.
3. One consistent system across all sections, so staff learn a pattern once.
4. Permission-aware: staff see only what their role allows, and the UI should not hint at hidden areas.
