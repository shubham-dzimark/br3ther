import { test } from "node:test";
import assert from "node:assert/strict";
import { giftCardEmail } from "@/lib/mail-templates";

const base = {
  amount: "$100",
  code: "GDFR-7KQ2-M9XD",
  recipientName: "Sam",
  senderName: "Al",
  message: "Happy birthday <script>alert(1)</script>",
  storeName: "Br3thr",
  storeUrl: "https://br3thr.com",
};

test("the friend's email carries the amount, code, sender and an escaped message", () => {
  const mail = giftCardEmail({ ...base, mode: "recipient" });
  assert.equal(mail.subject, "Sam, you've received a $100 Br3thr gift card");
  for (const part of ["GDFR-7KQ2-M9XD", "$100", "Al", "no expiry"]) {
    assert.ok(mail.html.includes(part), `html missing ${part}`);
    assert.ok(mail.text.includes(part), `text missing ${part}`);
  }
  assert.ok(mail.html.includes("&lt;script&gt;"));
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(mail.html.includes("https://br3thr.com/shop"));
});

test("the buyer's copy says the gift is on its way", () => {
  const mail = giftCardEmail({ ...base, mode: "buyer-copy" });
  assert.equal(mail.subject, "Your gift to Sam is on its way");
  assert.ok(mail.html.includes("GDFR-7KQ2-M9XD"));
});

test("a card sent to the buyer to hand over says so", () => {
  const mail = giftCardEmail({ ...base, message: null, mode: "buyer-to-give" });
  assert.equal(mail.subject, "Your $100 Br3thr gift card for Sam");
  assert.ok(mail.html.includes("GDFR-7KQ2-M9XD"));
});

test("order emails list gift cards, what a card paid, and drop shipping for email-only orders", async () => {
  const { orderPlacedEmail } = await import("@/lib/mail-templates");
  const base = {
    storeName: "Br3thr",
    storeUrl: "https://br3thr.com",
    orderLabel: "#0007",
    orderDate: "7 October 2026",
    customerName: "Al",
    lines: [{ name: "Gift Card", variant: "$100 · To Sam · emailed to sam@example.com", quantity: 1, lineTotal: "$100 CAD" }],
    subtotal: "$0 CAD",
    shipping: "Free",
    total: "$100 CAD",
    address: ["Delivered by email"],
  };
  const digital = orderPlacedEmail({ ...base, giftCards: "$100 CAD", digitalOnly: true }, "");
  assert.ok(digital.html.includes("Gift cards"));
  assert.ok(!digital.html.includes("Shipping"));
  assert.ok(digital.html.includes("To Sam"));

  const paid = orderPlacedEmail({ ...base, lines: [], subtotal: "$24.99 CAD", total: "$0 CAD", giftCardPaid: "$24.99 CAD", address: ["Al"] }, "");
  assert.ok(paid.html.includes("Paid by gift card"));
  assert.ok(paid.html.includes("Shipping"));
});
