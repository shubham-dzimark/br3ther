import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FLAVOUR_FALLBACK,
  SITE_DEFAULTS,
  fillPay,
  lookOf,
  mergeSiteContent,
  payPhrase,
  siteContentFromForm,
} from "../src/lib/site-content";

test("blank or broken settings fall back to the site's own copy", () => {
  assert.deepEqual(mergeSiteContent(undefined), SITE_DEFAULTS);
  assert.deepEqual(mergeSiteContent("not json"), SITE_DEFAULTS);
  assert.deepEqual(mergeSiteContent("[1,2]"), SITE_DEFAULTS);
});

test("the admin form round-trips; blank fields fall back", () => {
  const fd = new FormData();
  fd.set("hero.lede", "One scoop a day.");
  fd.set("inside.1.head", "Nothing else");
  fd.set("flavour.0.ground", "#ABCDEF");
  fd.set("flavour.0.lid", "red"); // not a hex colour: ignored
  fd.set("faq.0.q", "Is it vegan?");
  fd.set("faq.0.a", "Yes.");
  fd.set("faq.1.q", "Half a row"); // no answer: dropped
  const c = siteContentFromForm(fd, ["Unflavoured", "Mango"]);

  assert.equal(c.hero.lede, "One scoop a day.");
  assert.equal(c.inside.steps[1].head, "Nothing else");
  assert.equal(c.inside.steps[1].cap, SITE_DEFAULTS.inside.steps[1].cap);
  assert.equal(c.inside.steps.length, 4);
  assert.equal(c.statement.text, SITE_DEFAULTS.statement.text);
  assert.deepEqual(c.flavours.Unflavoured, { ground: "#abcdef", lid: SITE_DEFAULTS.flavours.Unflavoured.lid });
  assert.deepEqual(c.flavours.Mango, FLAVOUR_FALLBACK);
  assert.deepEqual(c.faq.items, [{ q: "Is it vegan?", a: "Yes." }]);
});

test("clearing every question restores the default list", () => {
  const c = siteContentFromForm(new FormData(), []);
  assert.deepEqual(c.faq.items, SITE_DEFAULTS.faq.items);
});

test("a flavour added on the product later gets a neutral look", () => {
  assert.deepEqual(lookOf(SITE_DEFAULTS, "Brand new"), FLAVOUR_FALLBACK);
  assert.equal(lookOf(SITE_DEFAULTS, "Black cherry").lid, "#5a1020");
});

test("payment copy follows the methods checkout offers", () => {
  assert.equal(payPhrase(["emt"]), "Interac e-Transfer");
  assert.equal(payPhrase(["emt", "crypto"]), "Interac e-Transfer or crypto");
  assert.equal(payPhrase([]), "the payment method shown at checkout");
  assert.equal(fillPay("Pay by {pay}.", payPhrase(["crypto"])), "Pay by crypto.");
});
