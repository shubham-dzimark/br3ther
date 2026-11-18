# Gift Cards — Design

Date: 2026-10-07 · Store: yayobros.st · Status: approved in chat, awaiting spec review

## Goal

Let a customer buy a gift card ($50 / $100 / $200) for a friend, in the normal
cart, and let the friend spend it at checkout like store credit.

## Decisions (from the user)

| Question | Answer |
|---|---|
| Delivery | Buyer chooses per card: **email it to my friend** or **send it to me** to hand over |
| Unused value | **Keeps a balance** — partial spend leaves the rest on the card |
| Where it is bought | **In the normal cart**, alongside products (approach A) |
| Catalogue | A real **"Gift Card" product** in the shop, linked from the **top menu** |
| Amounts | $50, $100, $200 |

Defaults agreed with the design (no objection raised):

- **No expiry.** Most provinces bar expiring gift cards.
- **A card is payment, not a discount.** It stacks with a coupon, points or a
  referral discount on the friend's order.
- **No discounts on buying one.** Coupons, points, referral, bundle and tier
  deals never reduce a gift card line.
- **No shipping and no tax** on the card itself (tax applies when it is spent).
- **Not counted** toward free shipping, free-gift offers, checkout upsell
  thresholds or points earned. Buying a card earns no points; the friend earns
  points on what the card buys.
- **A card cannot buy another card.**

## Catalogue

- New product type `GIFT_CARD` (enum `ProductType`). One product, "Gift Card",
  slug `gift-card`, with three variants $50 / $100 / $200. It is created by a
  seed/migration step, is editable in the normal product editor (name, image,
  description), and never tracks stock.
- Product card in the grid: no inline quick-add (a gift card needs recipient
  details). The card shows the price range and a **"Choose amount"** button
  linking to the product page.
- Product page: instead of the normal buy panel, a gift card panel —
  amount buttons, delivery choice ("Email it to my friend" / "Send it to me"),
  friend's name + email (when emailing), sender name, message (≤ 300 chars),
  then **Add to cart**. Validated server-side.
- Top menu: a "Gift Card" item → `/products/gift-card`, added to the live
  header menu (Content → Header).

## Data model

```
GiftCard
  id, code (unique, e.g. YAYO-7KQ2-M9XD), initialCents, balanceCents,
  status: PENDING | ACTIVE | VOID,
  purchaseOrderId, purchaseOrderItemId,
  buyerEmail, senderName, recipientName, recipientEmail?, message?,
  deliverTo: RECIPIENT | BUYER,
  issuedAt?, emailedAt?, createdAt, updatedAt

GiftCardTransaction  (the ledger; balance = sum)
  id, giftCardId, kind: ISSUE | REDEEM | RESTORE | VOID | ADJUST,
  amountCents (signed), orderId?, adminId?, note?, createdAt
```

Additions to existing models:

- `CartItem`: `giftCardDetails Json?` — recipient fields for a gift card line.
- `OrderItem`: `isGiftCard Boolean @default(false)` + `giftCardDetails Json?`.
- `Order`: `giftCardCents Int @default(0)` (face value of cards bought, kept
  out of `subtotalCents`), `giftCardRedeemedCents Int @default(0)`,
  `giftCardRedeemedId String?`.

Codes: 12 random chars from an unambiguous alphabet (no 0/O/1/I), shown as
`YAYO-XXXX-XXXX`; lookups are case- and dash-insensitive.

## Money flow

The whole checkout maths runs through `computeTotals(subtotalCents, …)`.
Gift card lines are kept **out** of that subtotal:

```
merchSubtotal  = product lines only          → computeTotals (discounts,
                                                shipping, tax, points, EMT
                                                adjustment, offers) as today
giftCardsBought = gift card lines at face value (no tax / shipping / discount)
orderTotal      = merchTotal + giftCardsBought
redeemed        = min(card balance, orderTotal − giftCardsBought)   ← a card
                                                cannot pay for cards
amountDue       = orderTotal − redeemed
```

- `priceCart` already prices a line without a product from its stored amount.
  Gift card lines have a variant, so priceCart treats `GIFT_CARD` variants as
  fixed face value and excludes them from bundle/tier/upsell logic.
- `Order.subtotalCents` stays products-only, so points earned
  (`loyalty.ts` reads it) and finance reports are unaffected.
- **Gift-card-only cart:** no shipping step and no address — the order stores
  "Digital delivery" placeholders in the required address columns.
- **Amount due $0** (fully covered by a card): order is placed straight to
  `PAYMENT_RECEIVED` via `confirmOrderPaid` with method `giftcard`; no EMT.

## Lifecycle

1. **Add to cart** — line stores variant + `giftCardDetails`.
2. **Place order** — one `GiftCard` row per gift card line, status `PENDING`,
   balance 0. If a card is being *redeemed*, a `REDEEM` transaction holds the
   amount immediately (balance drops), inside the order transaction.
3. **Payment confirmed** (`confirmOrderPaid`) — each `PENDING` card for the
   order gets an `ISSUE` transaction, becomes `ACTIVE`, and is emailed
   (recipient + copy to buyer, or buyer only). Idempotent.
4. **Cancel / refund** (`reverseOrderPayment`):
   - cards **bought** on the order → `VOID` (if any of a card's value was
     already spent, it is voided only for the unspent balance and the admin
     is warned on the order page);
   - a card **redeemed** on the order → `RESTORE` transaction returns the
     amount. Idempotent.

## Checkout UI

- A "Gift card" code box in the order summary, beside discount and referral.
- On apply: shows "Gift card YAYO-…-M9XD — $40 applied, $60 left on the
  card", with Remove. Errors: not found, no balance, voided, pending payment.
- Re-validated at order placement (balance may have changed).
- Order confirmation, thank-you page, order emails and admin order view show
  the gift card line(s) and the redemption.

## Emails

- `giftCardEmail` in `mail-templates.ts`, same branded layout: amount as the
  hero, code in a ticket-style box, sender name + message, "Shop now" button,
  how to redeem, "no expiry".
- Buyer copy when emailed to a friend: "Your gift to Sam is on its way" + code.

## Storefront extras

- "Check your gift card balance" box on the gift card product page.

## Admin

- **Gift Cards** screen (sidebar, Marketing group): list with code, amount,
  balance, buyer, recipient, status, created; search by code/email; detail
  view with the transaction ledger.
- Actions: resend email, void, adjust balance (signed amount + required note,
  logged with admin id).
- Settings: gift cards on/off (off hides the product and refuses the code box).
  Amounts are edited as the product's variants.

## Out of scope

Physical/printed cards, scheduled delivery dates, custom amounts, gift cards
in other currencies, selling cards on other sites.

## Testing

- Buy: gift-card-only cart (no address step) and mixed with products.
- Totals: a normal order's totals are byte-identical before and after the
  change; a mixed order applies coupon/shipping/tax/points to products only.
- Issue: confirming payment activates and emails each card once (twice-
  confirm does nothing), both delivery modes.
- Redeem: partial (balance left), full card, order fully covered ($0 due,
  auto-confirmed), card cannot pay for a card, stacking with a coupon.
- Reverse: cancelling a redeeming order restores the balance once; cancelling
  a buying order voids its cards.
- Admin: list, resend, void, adjust with note.
- Verified locally on a DB copy, then deployed with a migration.
