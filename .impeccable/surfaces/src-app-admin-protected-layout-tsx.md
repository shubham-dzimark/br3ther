---
version: 1
slug: "src-app-admin-protected-layout-tsx"
primary_target: "src/app/admin/(protected)/layout.tsx"
related_targets: ["src/app/admin/login/page.tsx"]
---

# Surface brief: Br3thr admin panel

Scope: every screen under /admin, plus the login and two-factor screens. Mode: Operate.
Audience and job: shop staff running orders and payment confirmation, catalogue and stock, support, and marketing and content. The work is visual only: no change to data, actions, routes or permissions.
Constraints: black and white base with matching accents; not dense; light and dark with a per-browser toggle that defaults to the system setting; status colour muted and always paired with a label.
Unresolved: final logo artwork (the Godfather crest is a placeholder).

## Direction contract

THESIS: The admin is a photographer's proof sheet. Every record is a frame and the shop's state reads at a glance; the one thing that needs a human is marked in red wax pencil. It refuses the category default of grey SaaS cards with a coloured accent sprinkled everywhere.

OWN-WORLD: A film-rebate black rail (#0B0B0B), and a white proof-sheet workspace with a silver-gelatin neutral ramp and 1px hairlines on one visible grid. Small JetBrains Mono edge codes (01, 02A, SKU, order IDs), and Schibsted Grotesk for everything else. Rank is carried by weight, case and reversal: one reversed black plate per screen. China-marker red (#D2402B) only for the wax mark, the current page dot and focus. Dark mode is the negative: near-black sheet, white ink, the same red.

STORY: Staff open the admin, see in one look what happened and what needs them, act on the marked item, and move through sections that all share one frame anatomy.

FIRST VIEWPORT: The black rail on the left with grouped navigation, each item with a mono edge-code number and a red dot on the current page. A top bar with search, a light/dark/auto toggle, notifications and profile. The page header carries a mono kicker (section · date), a large title, and its primary action on the right. On the dashboard, a strip of four framed exposures (revenue, orders, to confirm, stock), each with its history line, the "needs you" frame reversed to black; below, recent orders with the action-needed row ringed in wax pencil, and the product frames at one fixed scale.

FORM: Contact Sheet, position 5 on the ordered list (assigned by roll). seed:2a4a91adb8ab8d94. Raises: rank by weight, case and reversal (timetable); fixed name-plate anatomy per record (character catalog); one visible hairline grid (Crouwel); thumbnails at one scale and ground (botanical); scale contrast between figures and mono labels (specimen).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
