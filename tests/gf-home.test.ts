import { test } from "node:test";
import assert from "node:assert/strict";
import { GF_HOME_DEFAULTS, gfHomeFromForm, mergeGfHome } from "../src/lib/gf-home";

test("blank or broken settings fall back to the design copy", () => {
  assert.deepEqual(mergeGfHome(undefined), GF_HOME_DEFAULTS);
  assert.deepEqual(mergeGfHome("not json"), GF_HOME_DEFAULTS);
});

test("the admin form round-trips, blanks fall back, switches turn off", () => {
  const fd = new FormData();
  fd.set("hero.show", "on");
  fd.set("hero.line2", "Don");
  fd.set("hero.badge1", "Free Shipping");
  fd.set("categories.count", "6");
  fd.set("categories.slugs", "cigars, lighters");
  fd.set("featured.count", "99");
  fd.set("features.0.icon", "crown");
  fd.set("features.1.icon", "<script>");
  fd.set("testimonials.source", "custom");
  fd.set("testimonials.2.name", "Vito C.");
  const out = gfHomeFromForm(fd);
  assert.equal(out.hero.show, true);
  assert.equal(out.hero.line2, "Don");
  assert.equal(out.hero.line1, GF_HOME_DEFAULTS.hero.line1);
  assert.equal(out.hero.badges[1], "Free Shipping");
  assert.equal(out.promo.show, false);
  assert.equal(out.categories.count, 6);
  assert.equal(out.categories.slugs, "cigars, lighters");
  assert.equal(out.featured.count, GF_HOME_DEFAULTS.featured.count);
  assert.equal(out.features.items[0].icon, "crown");
  assert.equal(out.features.items[1].icon, GF_HOME_DEFAULTS.features.items[1].icon);
  assert.equal(out.testimonials.source, "custom");
  assert.equal(out.testimonials.items[2].name, "Vito C.");
  assert.deepEqual(mergeGfHome(JSON.stringify(out)), out);
});
