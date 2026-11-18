import { test } from "node:test";
import assert from "node:assert/strict";
import { headerStyle, footerStyle } from "../src/lib/chrome-style";

test("header: simple only when chosen, otherwise full", () => {
  assert.equal(headerStyle("simple"), "simple");
  assert.equal(headerStyle(" simple "), "simple");
  for (const v of [undefined, null, "", "full", "Simple2"]) assert.equal(headerStyle(v), "full");
});

test("footer: copyright only when chosen, otherwise full", () => {
  assert.equal(footerStyle("copyright"), "copyright");
  for (const v of [undefined, null, "", "full", "minimal"]) assert.equal(footerStyle(v), "full");
});
