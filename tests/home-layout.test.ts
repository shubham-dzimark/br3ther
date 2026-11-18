import { test } from "node:test";
import assert from "node:assert/strict";
import { homeLayout } from "../src/lib/home-layout";

test("banner only when explicitly chosen", () => {
  assert.equal(homeLayout("banner"), "banner");
  assert.equal(homeLayout(" banner "), "banner");
});

test("anything else falls back to the classic page", () => {
  assert.equal(homeLayout(undefined), "classic");
  assert.equal(homeLayout(null), "classic");
  assert.equal(homeLayout(""), "classic");
  assert.equal(homeLayout("classic"), "classic");
  assert.equal(homeLayout("Banner2"), "classic");
});

import { bannerStyle } from "../src/lib/banner-types";

test("banner design: known values kept, anything else is framed", () => {
  assert.equal(bannerStyle("cinematic"), "cinematic");
  assert.equal(bannerStyle(" bold "), "bold");
  assert.equal(bannerStyle("framed"), "framed");
  assert.equal(bannerStyle(undefined), "framed");
  assert.equal(bannerStyle("neon"), "framed");
});
