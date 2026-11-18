import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateGiftCardCode,
  normalizeGiftCardCode,
  formatGiftCardCode,
  giftCardRedeemable,
  parseGiftCardDetails,
} from "../src/lib/gift-card-core";

test("generated codes use the GDFR-XXXX-XXXX format with no ambiguous characters", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const code = generateGiftCardCode();
    assert.match(code, /^GDFR-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    seen.add(code);
  }
  assert.equal(seen.size, 1000);
});

test("codes normalise regardless of case, spaces, dashes and a missing prefix", () => {
  assert.equal(normalizeGiftCardCode(" gdfr-7kq2 m9xd "), "GDFR7KQ2M9XD");
  assert.equal(normalizeGiftCardCode("7KQ2M9XD"), "GDFR7KQ2M9XD");
  assert.equal(formatGiftCardCode("GDFR7KQ2M9XD"), "GDFR-7KQ2-M9XD");
});

test("a card pays at most its balance and never more than the product amount due", () => {
  assert.equal(giftCardRedeemable({ balanceCents: 10000, productDueCents: 6000 }), 6000);
  assert.equal(giftCardRedeemable({ balanceCents: 5000, productDueCents: 8000 }), 5000);
  assert.equal(giftCardRedeemable({ balanceCents: 5000, productDueCents: -10 }), 0);
});

test("gift card details are validated", () => {
  // Emailing a friend needs their email.
  assert.equal(
    parseGiftCardDetails({ deliverTo: "RECIPIENT", recipientName: "Sam", recipientEmail: "", senderName: "Al" }),
    null,
  );
  assert.equal(
    parseGiftCardDetails({ deliverTo: "RECIPIENT", recipientName: "Sam", recipientEmail: "not-an-email", senderName: "Al" }),
    null,
  );
  // Handing it over in person needs no email.
  assert.deepEqual(
    parseGiftCardDetails({ deliverTo: "BUYER", recipientName: " Sam ", recipientEmail: "", senderName: "Al", message: "" }),
    { deliverTo: "BUYER", recipientName: "Sam", recipientEmail: null, senderName: "Al", message: null },
  );
  assert.equal(
    parseGiftCardDetails({ deliverTo: "BUYER", recipientName: "Sam", senderName: "Al", message: "x".repeat(301) }),
    null,
  );
  assert.deepEqual(
    parseGiftCardDetails({ deliverTo: "RECIPIENT", recipientName: "Sam", recipientEmail: "Sam@Example.com ", senderName: "Al", message: "Happy birthday" }),
    { deliverTo: "RECIPIENT", recipientName: "Sam", recipientEmail: "sam@example.com", senderName: "Al", message: "Happy birthday" },
  );
});

test("a gift card line says who it is for", async () => {
  const { giftCardRecipientText } = await import("../src/lib/gift-card-core");
  assert.equal(
    giftCardRecipientText({ deliverTo: "RECIPIENT", recipientName: "Sam", recipientEmail: "sam@example.com", senderName: "Al", message: null }),
    "To Sam · emailed to sam@example.com",
  );
  assert.equal(
    giftCardRecipientText({ deliverTo: "BUYER", recipientName: "Sam", recipientEmail: null, senderName: "Al", message: null }),
    "To Sam · sent to you to give in person",
  );
});
