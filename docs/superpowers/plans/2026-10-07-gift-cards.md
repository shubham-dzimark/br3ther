# Gift Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers buy $50/$100/$200 gift cards in the normal cart (emailed to a friend or to themselves); anyone holding a code spends it at checkout as a balance.

**Architecture:** A `GIFT_CARD` product type with three variants. Gift card cart lines are priced at face value and kept **out** of `CartView.subtotalCents` (new `giftCardCents` beside it), so every existing subtotal consumer — `computeTotals`, shipping, offers, upsells, points — ignores them unchanged; only grand totals add them back. Cards and balances live in `GiftCard` + a signed `GiftCardTransaction` ledger; issuing hangs off `confirmOrderPaid`, voiding/restoring off `reverseOrderPayment`.

**Tech Stack:** Next.js 16 App Router (server actions), React 19, Prisma 7 + PostgreSQL, Tailwind v4. Tests: Node's built-in runner via `tsx` against the local DB `yayobros_local`.

**Spec:** `docs/superpowers/specs/2026-10-07-gift-cards-design.md`

## Global Constraints

- Amounts: $50, $100, $200 (variants of one product, slug `gift-card`, type `GIFT_CARD`).
- Code format `YAYO-XXXX-XXXX`, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I); lookups ignore case, spaces and dashes.
- Message ≤ 300 characters; recipient email required only when `deliverTo = RECIPIENT`.
- No expiry. Gift card lines: no discount, no shipping, no tax, no points, not counted toward free shipping / free-gift / upsell thresholds.
- A card can pay for products, shipping and tax, never for gift card lines.
- Black buttons, DM Sans, rounded corners — match the current storefront.
- Local DB only for tests (`.env` → `yayobros_local`); never touch live data except the deploy task.
- The project is not a git repo: each "Checkpoint" step = `npx tsc --noEmit -p .` clean + the task's tests green.
- Test command (set up in Task 1): `npm test` → `tsx --env-file=.env --conditions=react-server --test tests/*.test.ts`.

## Review Focus

1. **Card applied, then order cancelled twice** — balance restored exactly once (ledger idempotent).
2. **Two tabs redeem the same $50 card at once** — total redeemed never exceeds the balance (conditional decrement, not read-then-write).
3. **Normal order with no gift cards** — totals identical to before the change (subtotal, tax, total, points).
4. **Card worth more than the order's product part, cart also holds a gift card line** — card covers products+shipping+tax only; the gift card line is still due.
5. **Payment confirmed twice / confirm after cancel** — cards issued and emailed once; never issued on a cancelled order.

Each has a test in the task that owns the code (Tasks 3, 4, 6).

---

### Task 1: Test harness + pure gift card core

**Files:**
- Modify: `package.json` (devDependency `tsx`, script `"test"`)
- Create: `src/lib/gift-card-core.ts` (no `server-only`, no imports from `@/lib/prisma`)
- Test: `tests/gift-card-core.test.ts`

**Interfaces:**
- Produces:
  - `generateGiftCardCode(random?: () => number): string` → `YAYO-XXXX-XXXX`
  - `normalizeGiftCardCode(input: string): string` → `YAYOXXXXXXXX` (upper, no dashes/spaces; adds `YAYO` prefix if 8 chars given)
  - `formatGiftCardCode(normalized: string): string` → `YAYO-XXXX-XXXX`
  - `giftCardRedeemable(args: { balanceCents: number; productDueCents: number }): number` → `min(balance, max(0, productDueCents))`
  - `type GiftCardDetails = { deliverTo: "RECIPIENT" | "BUYER"; recipientName: string; recipientEmail: string | null; senderName: string; message: string | null }`
  - `parseGiftCardDetails(raw: unknown): GiftCardDetails | null` (validates per Global Constraints; trims; message ≤ 300)

- [ ] **Step 1:** `npm i -D tsx`; add `"test": "tsx --env-file=.env --conditions=react-server --test tests/*.test.ts"`.
- [ ] **Step 2: Write failing tests** (`node:test` + `node:assert/strict`):
  - code matches `/^YAYO-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/` across 1000 generations, no duplicates in that run
  - `normalizeGiftCardCode(" yayo-7kq2 m9xd ") === "YAYO7KQ2M9XD"`, `normalizeGiftCardCode("7KQ2M9XD") === "YAYO7KQ2M9XD"`, `formatGiftCardCode("YAYO7KQ2M9XD") === "YAYO-7KQ2-M9XD"`
  - `giftCardRedeemable({balanceCents:10000, productDueCents:6000}) === 6000`; `({5000, 8000}) === 5000`; `({5000, -10}) === 0`
  - `parseGiftCardDetails({deliverTo:"RECIPIENT", recipientName:"Sam", recipientEmail:"", senderName:"Al"}) === null`; BUYER with no email → valid with `recipientEmail: null`; 301-char message → null; bad email → null
- [ ] **Step 3:** Run `npm test` → FAIL (module missing).
- [ ] **Step 4:** Implement `src/lib/gift-card-core.ts`. Use `crypto.getRandomValues` when no `random` is passed.
- [ ] **Step 5:** `npm test` → PASS. Checkpoint.

### Task 2: Schema, migration, product seed, setting

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261007120000_gift_cards/migration.sql`
- Create: `scripts/seed-gift-card-product.mjs` (idempotent: upsert product `gift-card` + 3 variants)
- Modify: `src/lib/settings.ts` (`giftCardsEnabled: "giftcards.enabled"`, default `"1"`)

**Interfaces:**
- Produces (Prisma):
  - `enum ProductType { … GIFT_CARD }`
  - `enum GiftCardStatus { PENDING ACTIVE VOID }`, `enum GiftCardDelivery { RECIPIENT BUYER }`, `enum GiftCardTxKind { ISSUE REDEEM RESTORE VOID ADJUST }`
  - `model GiftCard { id, code String @unique, initialCents Int, balanceCents Int @default(0), status GiftCardStatus @default(PENDING), purchaseOrderId String?, purchaseOrderItemId String? @unique, buyerEmail String, senderName String, recipientName String, recipientEmail String?, message String?, deliverTo GiftCardDelivery, issuedAt DateTime?, emailedAt DateTime?, createdAt, updatedAt, transactions GiftCardTransaction[] }` — index `[purchaseOrderId]`, `[status, createdAt]`
  - `model GiftCardTransaction { id, giftCardId, kind GiftCardTxKind, amountCents Int, orderId String?, adminId String?, note String?, createdAt }` — `@@unique([giftCardId, kind, orderId])` (the idempotency key for ISSUE/REDEEM/RESTORE/VOID per order), index `[giftCardId, createdAt]`. ADJUST rows have `orderId = null`; Postgres allows repeated nulls in the unique.
  - `CartItem.giftCardDetails Json?`
  - `OrderItem.isGiftCard Boolean @default(false)`, `OrderItem.giftCardDetails Json?`
  - `Order.giftCardCents Int @default(0)`, `Order.giftCardRedeemedCents Int @default(0)`, `Order.giftCardRedeemedId String?`
- Seed: product `name "Gift Card"`, `slug "gift-card"`, `type GIFT_CARD`, `status PUBLISHED`, variants `"$50" 5000`, `"$100" 10000`, `"$200" 20000`, `manageStock false`, `stockStatus IN_STOCK`, short description "Send a Yayo Bros gift card to a friend — delivered by email, no expiry."

- [ ] **Step 1:** Edit schema; write migration SQL by hand (`ALTER TYPE "ProductType" ADD VALUE 'GIFT_CARD'` first, then new enums/tables/columns).
- [ ] **Step 2:** `npx prisma migrate deploy && npx prisma generate` on local → applies cleanly.
- [ ] **Step 3:** `node scripts/seed-gift-card-product.mjs` twice → one product, three variants (second run changes nothing).
- [ ] **Step 4:** Admin product editor: the type `<select>` (`src/components/admin/ProductTypeFields.tsx`, `ProductForm.tsx`, `products/actions.ts`) accepts and preserves `GIFT_CARD`, labelled "Gift card". Open `/admin/products/<id>` for the gift card locally → saves without changing type.
- [ ] **Step 5:** Checkpoint (`tsc` clean; existing pages `/`, `/shop`, `/products/<any>` still 200).

### Task 3: Gift card ledger library

**Files:**
- Create: `src/lib/gift-cards.ts` (`import "server-only"`)
- Test: `tests/gift-cards.test.ts` (creates its own rows with a `TEST-` buyer email, deletes them in `after()`)

**Interfaces:**
- Consumes: Task 1 core, Task 2 models.
- Produces (all take an optional `tx: Prisma.TransactionClient`, default `prisma`):
  - `findGiftCard(code: string): Promise<GiftCard | null>` (normalized lookup)
  - `createPendingCards(orderId: string, items: { orderItemId: string; initialCents: number; details: GiftCardDetails }[], buyerEmail: string, tx?)` → creates one `PENDING` card per item with a fresh unique code (retry on P2002)
  - `holdRedemption(code: string, orderId: string, cents: number, tx?) : Promise<{ ok: true; cardId: string } | { ok: false; error: "not_found" | "inactive" | "insufficient" }>` — single conditional `updateMany({ where:{ id, status:"ACTIVE", balanceCents:{ gte: cents } }, data:{ balanceCents:{ decrement: cents } } })` + `REDEEM` tx (`amountCents: -cents`)
  - `issueCardsForOrder(orderId: string): Promise<GiftCard[]>` — PENDING→ACTIVE, `balanceCents = initialCents`, `ISSUE` tx; returns only cards newly issued by this call; does nothing if the order is `CANCELLED`/`REFUNDED`
  - `reverseGiftCardsForOrder(orderId: string): Promise<{ restoredCents: number; voided: number; partlySpent: string[] }>` — `RESTORE` the order's REDEEM; `VOID` cards bought on the order (VOID tx = `-balanceCents`, balance → 0); codes with `balanceCents < initialCents` go in `partlySpent`
  - `adjustGiftCard(cardId: string, amountCents: number, note: string, adminId: string)`; `voidGiftCard(cardId: string, adminId: string, note: string)`
- Idempotency comes from `@@unique([giftCardId, kind, orderId])`: create the tx row first inside the transaction; on P2002, skip the balance change.

- [ ] **Step 1: Failing tests:**
  - `holdRedemption` on a $50 ACTIVE card for 3000 → ok, balance 2000; again for 3000 → `insufficient`, balance still 2000
  - **Review Focus 2:** two concurrent `holdRedemption(…, 4000)` on a 5000 card (`Promise.all`) → exactly one ok, final balance 1000
  - `issueCardsForOrder` twice → first returns 1 card ACTIVE balance=initial, second returns `[]`; one ISSUE row (**Review Focus 5**)
  - `issueCardsForOrder` on an order with status `CANCELLED` → `[]`, card stays PENDING (**Review Focus 5**)
  - `reverseGiftCardsForOrder` twice on an order that redeemed 3000 → balance back +3000 once (**Review Focus 1**)
  - reverse on an order that bought a card whose balance was partly spent → status VOID, balance 0, code in `partlySpent`
  - `adjustGiftCard(+500)` → balance +500, ADJUST row with note and adminId
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS. Checkpoint.

### Task 4: Cart — adding gift cards and pricing them apart

**Files:**
- Modify: `src/lib/cart.ts` (`CartLine.isGiftCard: boolean`, `CartLine.giftCardDetails: GiftCardDetails | null`, `CartView.giftCardCents: number`; `priceCart` + `refreshCartTotals`)
- Modify: `src/app/(storefront)/cart-actions.ts` (new `addGiftCardToCart(fd: FormData)`; `addToCart` refuses `GIFT_CARD` variants → redirect to `/products/gift-card`)
- Modify: `src/lib/gifts.ts` `giftLinesFor`, `src/lib/checkout-upsell.ts` basket builders — skip `isGiftCard` lines
- Modify: cart page `src/app/(storefront)/cart/page.tsx`, `src/components/store/MiniCart.tsx`, `src/components/store/Header.tsx` (miniCart props) — grand total = `subtotalCents + giftCardCents`; gift card line shows "To Sam · sam@… " or "To give in person", no quantity stepper (qty fixed 1)
- Test: `tests/gift-card-cart.test.ts` (calls `priceCart` on a cart it creates)

**Interfaces:**
- Consumes: `parseGiftCardDetails` (Task 1), product type `GIFT_CARD` (Task 2).
- Produces: `CartView.giftCardCents`; `CartLine.isGiftCard`; form fields for `addGiftCardToCart`: `variantId, deliverTo, recipientName, recipientEmail, senderName, message`; quantity always 1, each add is its own line.
- `priceCart`: a line whose variant's product type is `GIFT_CARD` → `unitPriceCents = variant.priceCents` (no product discount, no tier/bundle/upsell), counted in `giftCardCents`, **excluded** from `subtotalCents`.

- [ ] **Step 1: Failing tests:**
  - cart with one $100 gift card line + one $24.99 product → `subtotalCents === 2499`, `giftCardCents === 10000`
  - **Review Focus 3:** cart with only product lines → `giftCardCents === 0` and `subtotalCents` equals the value computed by the unchanged code path (snapshot the number before editing `priceCart`)
  - product discount active on the gift card product → gift card line still 10000
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Browser: add a gift card via form post (Task 8 builds the UI; until then post with `curl`/devtools), cart and mini-cart show it with the right grand total; free-shipping bar unchanged by it. Checkpoint.

### Task 5: Checkout — buying and spending

**Files:**
- Modify: `src/app/(storefront)/checkout/page.tsx` (gift card box beside coupon/referral: form field `giftCardCode`, GET-param driven like `couponCode`; summary lines "Gift cards" `+giftCardCents` and "Gift card (YAYO-…-M9XD)" `−redeemed`, "Left on card" note; hide address fields + shipping choice when the cart has no product lines)
- Modify: `src/app/(storefront)/checkout/actions.ts` `placeOrder`
- Create: `src/lib/checkout-gift-cards.ts` → `giftCardSummary(args: { code: string | null; merchTotalCents: number; giftCardCents: number }): Promise<{ code: string | null; appliedCents: number; leftCents: number; error: string | null }>` used by both page and action
- Test: `tests/checkout-gift-cards.test.ts`

**Interfaces:**
- Consumes: `findGiftCard`, `holdRedemption`, `createPendingCards` (Task 3); `giftCardRedeemable` (Task 1); `CartView.giftCardCents` (Task 4).
- Order maths in `placeOrder` (totals from `computeTotals(cart.subtotalCents, …)` unchanged):
  - `merchTotal = cartHasProducts ? totals.totalCents : 0`
  - `redeemed = giftCardRedeemable({ balanceCents, productDueCents: merchTotal })`
  - `Order.totalCents = merchTotal + cart.giftCardCents - redeemed`; `Order.subtotalCents = totals.subtotalCents` (products only); `Order.giftCardCents = cart.giftCardCents`; `giftCardRedeemedCents`, `giftCardRedeemedId`
  - Gift-card-only cart: skip address validation, store `shipName = buyer name or email`, `shipLine1 = "Digital delivery"`, `shipCity/shipRegion/shipPostalCode = "-"`, shipping 0, tax 0.
  - Order items for gift card lines: `isGiftCard: true`, `giftCardDetails`, `unitPriceCents = lineTotalCents = face value`; then `createPendingCards` for them.
  - `holdRedemption` runs after the order row exists; on `{ok:false}` delete the just-created order and `redirect("/checkout?error=giftcard")`.
  - `Order.totalCents === 0` → call `confirmOrderPaid(order.id, { note: "Paid in full by gift card" })` and set `paymentMethodKey = "giftcard"`; skip EMT/crypto init (gateway check skipped when amount due is 0).
  - Points earned stay on `subtotalCents` (products) — no change to `loyalty.ts`.
- Error copy for `?error=giftcard`: "That gift card no longer has enough balance — please check it and try again."

- [ ] **Step 1: Failing tests for `giftCardSummary`:**
  - balance 10000, merchTotal 6000, giftCardCents 0 → applied 6000, left 4000
  - **Review Focus 4:** balance 20000, merchTotal 3000, giftCardCents 5000 → applied 3000 (never touches the 5000)
  - unknown code → error "We couldn't find that gift card."; PENDING card → "This gift card isn't active yet."; balance 0 → "This gift card has no balance left."
- [ ] **Step 2:** FAIL. **Step 3:** Implement `giftCardSummary`, page and action. **Step 4:** PASS.
- [ ] **Step 5: Browser checks (local):**
  - mixed cart: coupon applies to products only, tax only on products, total = products total + card
  - gift-card-only cart: no address/shipping fields; order placed; EMT instructions page shows face value
  - redeem a card for part of an order, then for the whole order (order goes straight to Payment received)
  - **Review Focus 3:** a products-only order placed before/after the change with the same cart → identical subtotal/tax/total in the DB
- [ ] **Step 6:** Checkpoint.

### Task 6: Issue on payment, reverse on cancel

**Files:**
- Modify: `src/lib/order-payment.ts` — end of a *changed* `confirmOrderPaid`: `const cards = await issueCardsForOrder(orderId); await sendGiftCardEmails(cards)`; inside `reverseOrderPayment` after the status transition succeeds: `reverseGiftCardsForOrder(orderId)` and, if `partlySpent.length`, append "Gift card(s) already partly used: …" to `staffNote`
- Test: extend `tests/gift-cards.test.ts`

**Interfaces:**
- Consumes: Task 3 functions; `sendGiftCardEmails(cards: GiftCard[]): Promise<void>` (Task 7 — until then a stub that marks nothing).

- [ ] **Step 1: Failing tests:** `confirmOrderPaid` on an order with one pending card → card ACTIVE; calling it again → no second ISSUE row; `reverseOrderPayment` → VOID + restore as in Task 3.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. Checkpoint.

### Task 7: Gift card email

**Files:**
- Modify: `src/lib/mail-templates.ts` — `giftCardEmail(d: { amount: string; code: string; recipientName: string; senderName: string; message: string | null; shopUrl: string; storeName: string; toBuyer: boolean })` returning `{ subject, html, text }` like `welcomeCodeEmail`
- Create in `src/lib/gift-cards.ts`: `sendGiftCardEmails(cards: GiftCard[])` — RECIPIENT: to recipient + buyer copy ("Your gift to Sam is on its way"); BUYER: to buyer only; sets `emailedAt`; `resendGiftCardEmail(cardId: string)` for admin
- Test: `tests/gift-card-email.test.ts` — html contains formatted code, amount, sender name, escaped message (`<script>` → `&lt;script&gt;`), "no expiry"; subject for recipient `"Sam, you've received a $100 Yayo Bros gift card"`.

- [ ] **Step 1:** Failing test. **Step 2:** FAIL. **Step 3:** Implement using `layout()`, `button()`, `panel()` and `brandMail`. **Step 4:** PASS.
- [ ] **Step 5:** Render to HTML file in scratchpad and view in the browser (logo, ticket-style code box, black button). Checkpoint.

### Task 8: Storefront — gift card product page, card, menu

**Files:**
- Create: `src/components/store/GiftCardPanel.tsx` (client) — amount buttons from variants, delivery toggle, fields per `GiftCardDetails`, posts to `addGiftCardToCart`; "Check your balance" form posting to `checkGiftCardBalance`
- Modify: `src/app/(storefront)/cart-actions.ts` — `checkGiftCardBalance(code: string): Promise<{ ok: boolean; message: string }>` (rate-limited per IP: reuse the store's existing limiter if present, else 10/min in memory)
- Modify: `src/app/(storefront)/products/[slug]/page.tsx` — `product.type === "GIFT_CARD"` renders `GiftCardPanel` in place of `ProductBuyPanel` and hides size guide / lab report actions
- Modify: `src/components/store/ProductCard.tsx` — `GIFT_CARD` products show price range + black "Choose amount" link (`/products/gift-card`) instead of `CardBuyBox`; `CARD_SELECT` gains `type`
- Menu: live header menu row "Gift Card → /products/gift-card" added in Task 10 (data step)

- [ ] **Step 1:** Implement; when `giftcards.enabled = "0"` the product page 404s and the panel/menu item are hidden.
- [ ] **Step 2: Browser checks:** amounts switch price; RECIPIENT without email shows inline error; add two cards to two friends → two cart lines; balance check shows "$40.00 left on YAYO-…"; mobile 375px layout fine. Checkpoint.

### Task 9: Admin

**Files:**
- Create: `src/app/admin/(protected)/gift-cards/page.tsx` (list, search `?q=` code/email, status filter), `src/app/admin/(protected)/gift-cards/[id]/page.tsx` (detail + ledger), `src/app/admin/(protected)/gift-cards/actions.ts` (`resendGiftCard`, `voidGiftCardAction`, `adjustGiftCardAction`; `requireCapability("orders")`)
- Modify: `src/components/admin/Sidebar.tsx` (entry "Gift Cards" beside Coupons, new `IconGiftCard`), `src/components/admin/Icons.tsx`
- Modify: `src/app/admin/(protected)/orders/[id]/page.tsx` — gift card items show recipient + card code/status; redemption line "Gift card YAYO-… −$X"
- Modify: order emails in `mail-templates.ts` (`orderPlacedEmail`, `paymentReceivedEmail`) and the thank-you page `checkout/received/[orderNumber]/page.tsx` — gift card lines and redemption line
- Modify: settings page for `giftcards.enabled` (Settings → Store)

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Browser checks:** list shows cards from Task 5 orders; adjust +$5 with note → ledger row; void → status VOID and checkout refuses it; resend sends (local mail log). Checkpoint.

### Task 10: Full verification and deploy

- [ ] **Step 1:** `npm test` all green; `npx tsc --noEmit -p .`; `npm run build` exit 0.
- [ ] **Step 2:** End-to-end locally: buy mixed cart with a gift card to a friend → confirm payment in admin → recipient email → spend part on a new order → cancel that order → balance restored → spend whole on another.
- [ ] **Step 3:** Deploy with `./deploy.sh --go`; on server: `npx prisma migrate deploy && npx prisma generate`, `node scripts/seed-gift-card-product.mjs`, `npm run build`, restart.
- [ ] **Step 4:** Live data: add header menu item "Gift Card → /products/gift-card" (append to the saved header menu, keep existing items and order).
- [ ] **Step 5:** Live checks: `/products/gift-card` 200, menu shows the link, `/shop` shows the card with "Choose amount", existing product checkout total unchanged, no errors from the new process in `journalctl`.
