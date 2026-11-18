/*
 * Regressions for converted carts being written to again (13 September 2026).
 *
 *   cd /var/www/br3thr && set -a && . ./.env && set +a
 *   npx tsx --conditions=react-server tests/cart-conversion-regressions.ts
 *
 * Drives src/lib/cart.ts against PostgreSQL with an in-memory cookie jar in
 * place of next/headers. Every row is synthetic and removed at the end.
 */
import { createHash, randomBytes } from "node:crypto";
import Module from "node:module";

type Jar = Map<string, { value: string; opts?: { expires?: Date } }>;
const jar: Jar = new Map();
const store = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
  set: (name: string, value: string, opts?: { expires?: Date }) => void jar.set(name, { value, opts }),
  delete: (name: string) => void jar.delete(name),
};
const loader = Module as unknown as { _load: (this: unknown, req: string, ...rest: unknown[]) => unknown };
const realLoad = loader._load;
loader._load = function (this: unknown, req: string, ...rest: unknown[]) {
  if (req === "next/headers") return { cookies: async () => store, headers: async () => new Headers() };
  // customer-auth imports redirect; the real module needs React's client runtime.
  if (req === "next/navigation") {
    return { redirect: (to: string) => { throw new Error(`redirect ${to}`); }, notFound: () => { throw new Error("notFound"); } };
  }
  return realLoad.call(this, req, ...rest);
};

/* eslint-disable @typescript-eslint/no-require-imports */
const { prisma } = require("../src/lib/prisma") as typeof import("../src/lib/prisma");
const cartLib = require("../src/lib/cart") as typeof import("../src/lib/cart");
/* eslint-enable @typescript-eslint/no-require-imports */
const { ensureCartToken, getOrCreateCart, getCart, adoptCartOnLogin, releaseCartAfterOrder, CART_COOKIE } = cartLib;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { rememberCheckoutEmail } = require("../src/app/(site)/email-actions") as typeof import("../src/app/(site)/email-actions");

let pass = 0, fail = 0;
const check = (n: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
  ok ? pass++ : fail++;
};
if (!/br3thr_audit/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Refusing to run: DATABASE_URL is not the audit database.");
}

(async () => {
  const stamp = Date.now();
  const cartIds: string[] = [];
  const customerIds: string[] = [];
  const reset = () => jar.clear();
  const cookie = () => jar.get(CART_COOKIE);
  const row = (id: string) => prisma.cart.findUnique({ where: { id }, include: { items: true } });
  const addLine = (cartId: string, name: string, qty = 1) =>
    prisma.cartItem.create({
      data: { cartId, variantId: `ccr-${name}-${stamp}`, nameSnapshot: name, unitPriceCents: 1000, quantity: qty },
    });
  const makeCart = async (data: { status?: "ACTIVE" | "CONVERTED" | "ABANDONED"; customerId?: string }) => {
    const c = await prisma.cart.create({ data: { token: randomBytes(24).toString("hex"), ...data } });
    cartIds.push(c.id);
    return c;
  };
  // Mirrors placeOrder's conversion block.
  const convert = async (cartId: string, orderId: string) => {
    await prisma.cart.update({
      where: { id: cartId },
      data: { status: "CONVERTED", recoveredOrderId: orderId, itemCount: 0, subtotalCents: 0 },
    });
    await prisma.cartItem.deleteMany({ where: { cartId } });
    await releaseCartAfterOrder();
  };
  const signIn = async (customerId: string) => {
    const token = randomBytes(32).toString("hex");
    await prisma.customerSession.create({
      data: {
        tokenHash: createHash("sha256").update(token).digest("hex"),
        customerId,
        expiresAt: new Date(Date.now() + 864e5),
      },
    });
    jar.set("nl_customer_session", { value: token });
  };
  const makeCustomer = async (tag: string) => {
    const c = await prisma.customer.create({ data: { email: `ccr-${tag}-${stamp}@example.test` } });
    customerIds.push(c.id);
    return c;
  };

  try {
    console.log("\n-- guest: place an order, then keep shopping --");
    reset();
    const t1 = await ensureCartToken();
    const c1 = await getOrCreateCart(t1);
    cartIds.push(c1.id);
    await addLine(c1.id, "Before");
    await convert(c1.id, `order-a-${stamp}`);
    check("cookie dropped after order", cookie(), undefined);
    check("cart reads empty", (await getCart()).lines.length, 0);
    const t2 = await ensureCartToken();
    check("new token issued", t2 !== t1, true);
    const c2 = await getOrCreateCart(t2);
    cartIds.push(c2.id);
    await addLine(c2.id, "After");
    check("new cart is a different row", c2.id !== c1.id, true);
    check("new cart is ACTIVE", (await row(c2.id))!.status, "ACTIVE");
    check("new cart holds the item", (await row(c2.id))!.items.map((i) => i.nameSnapshot), ["After"]);
    check("converted cart stays empty", (await row(c1.id))!.items.length, 0);
    check("converted cart stays CONVERTED", (await row(c1.id))!.status, "CONVERTED");
    check("recoveredOrderId untouched", (await row(c1.id))!.recoveredOrderId, `order-a-${stamp}`);
    check("getCart shows the new cart", (await getCart()).id, c2.id);

    console.log("\n-- a cookie still naming a converted cart (issued before this fix) --");
    reset();
    const stale = await makeCart({ status: "CONVERTED" });
    jar.set(CART_COOKIE, { value: stale.token });
    const view = await getCart();
    check("render shows an empty cart", [view.id, view.lines.length], [null, 0]);
    check("render leaves the cookie alone", cookie()?.value, stale.token);
    const t3 = await ensureCartToken();
    check("ensureCartToken returns the stale token", t3, stale.token);
    const c3 = await getOrCreateCart(t3);
    cartIds.push(c3.id);
    check("write gets a fresh cart", [c3.id !== stale.id, c3.status, c3.customerId], [true, "ACTIVE", null]);
    check("cookie rotated to the fresh token", cookie()?.value, c3.token);
    check("guest cookie stays a session cookie", cookie()?.opts?.expires, undefined);
    check("converted cart has no items", (await row(stale.id))!.items.length, 0);

    console.log("\n-- signed in, stale converted cookie --");
    reset();
    const shopper = await makeCustomer("signed");
    await signIn(shopper.id);
    const stale2 = await makeCart({ status: "CONVERTED", customerId: shopper.id });
    jar.set(CART_COOKIE, { value: stale2.token });
    const c4 = await getOrCreateCart(await ensureCartToken());
    cartIds.push(c4.id);
    check("fresh cart tied to the account", [c4.status, c4.customerId], ["ACTIVE", shopper.id]);
    check("cookie rotated and persistent", [cookie()?.value === c4.token, Boolean(cookie()?.opts?.expires)], [true, true]);

    console.log("\n-- signed in, placing an order then adding --");
    reset();
    await signIn(shopper.id);
    const c5 = await getOrCreateCart(await ensureCartToken());
    cartIds.push(c5.id);
    await addLine(c5.id, "Mine");
    await convert(c5.id, `order-b-${stamp}`);
    const c6 = await getOrCreateCart(await ensureCartToken());
    cartIds.push(c6.id);
    check("next cart is new, ACTIVE, on the account", [c6.id !== c5.id, c6.status, c6.customerId], [true, "ACTIVE", shopper.id]);
    check("its cookie is persistent", Boolean(cookie()?.opts?.expires), true);

    console.log("\n-- ABANDONED is still a live basket --");
    reset();
    const abandoned = await makeCart({ status: "ABANDONED" });
    await addLine(abandoned.id, "Left");
    jar.set(CART_COOKIE, { value: abandoned.token });
    check("getCart shows it", (await getCart()).lines.map((l) => l.name), ["Left"]);
    check("getOrCreateCart reuses it", (await getOrCreateCart(abandoned.token)).id, abandoned.id);

    console.log("\n-- adoptCartOnLogin --");
    // 1. guest basket, nothing saved -> claimed
    reset();
    const a1 = await makeCustomer("a1");
    const g1 = await makeCart({});
    await addLine(g1.id, "Guest");
    jar.set(CART_COOKIE, { value: g1.token });
    await adoptCartOnLogin(a1.id);
    check("guest cart claimed", (await row(g1.id))!.customerId, a1.id);
    check("claimed cookie persistent", [cookie()?.value === g1.token, Boolean(cookie()?.opts?.expires)], [true, true]);

    // 2. saved cart, no guest basket -> restored
    reset();
    const a2 = await makeCustomer("a2");
    const s2 = await makeCart({ customerId: a2.id });
    await addLine(s2.id, "Saved");
    await adoptCartOnLogin(a2.id);
    check("saved cart restored", cookie()?.value, s2.token);

    // 3. both -> merged into the saved one
    reset();
    const a3 = await makeCustomer("a3");
    const s3 = await makeCart({ customerId: a3.id });
    await addLine(s3.id, "Saved");
    const g3 = await makeCart({});
    await addLine(g3.id, "Guest");
    jar.set(CART_COOKIE, { value: g3.token });
    await adoptCartOnLogin(a3.id);
    check("merged lines", (await row(s3.id))!.items.map((i) => i.nameSnapshot).sort(), ["Guest", "Saved"]);
    check("guest cart removed", await row(g3.id), null);
    check("cookie on saved cart", cookie()?.value, s3.token);

    // 4. converted guest cookie + saved cart -> saved restored, converted untouched
    reset();
    const a4 = await makeCustomer("a4");
    const s4 = await makeCart({ customerId: a4.id });
    const g4 = await makeCart({ status: "CONVERTED" });
    jar.set(CART_COOKIE, { value: g4.token });
    await adoptCartOnLogin(a4.id);
    check("cookie on saved cart", cookie()?.value, s4.token);
    check("converted cart not claimed or deleted", [(await row(g4.id))?.customerId, (await row(g4.id))?.status], [null, "CONVERTED"]);

    // 5. converted guest cookie, nothing saved -> cookie dropped, row untouched
    reset();
    const a5 = await makeCustomer("a5");
    const g5 = await makeCart({ status: "CONVERTED" });
    jar.set(CART_COOKIE, { value: g5.token });
    await adoptCartOnLogin(a5.id);
    check("stale cookie dropped", cookie(), undefined);
    check("converted cart not claimed", (await row(g5.id))!.customerId, null);

    console.log("\n-- cart email --");
    reset();
    const mailer = await makeCustomer("mail");
    await signIn(mailer.id);
    const m1 = await getOrCreateCart(await ensureCartToken());
    cartIds.push(m1.id);
    check("signed-in new cart carries the account email", m1.email, mailer.email);

    reset();
    const a6 = await makeCustomer("a6");
    const g6 = await makeCart({});
    jar.set(CART_COOKIE, { value: g6.token });
    await adoptCartOnLogin(a6.id);
    check("claimed guest cart gets the account email", (await row(g6.id))!.email, a6.email);

    reset();
    const a7 = await makeCustomer("a7");
    const s7 = await makeCart({ customerId: a7.id });
    await adoptCartOnLogin(a7.id);
    check("restored saved cart gets the account email", (await row(s7.id))!.email, a7.email);

    reset();
    const g8 = await makeCart({});
    jar.set(CART_COOKIE, { value: g8.token });
    check("checkout email saved, trimmed and lowercased",
      [await rememberCheckoutEmail("  Guest.Shopper@Example.TEST "), (await row(g8.id))!.email],
      [true, "guest.shopper@example.test"]);
    check("invalid email ignored",
      [await rememberCheckoutEmail("not-an-email"), (await row(g8.id))!.email],
      [false, "guest.shopper@example.test"]);
    const g9 = await makeCart({ status: "CONVERTED" });
    jar.set(CART_COOKIE, { value: g9.token });
    check("converted cart never takes an email",
      [await rememberCheckoutEmail("x@example.test"), (await row(g9.id))!.email],
      [false, null]);
    reset();
    check("no cart cookie is a no-op, and sets no cookie",
      [await rememberCheckoutEmail("x@example.test"), cookie()],
      [false, undefined]);
  } finally {
    await prisma.cart.deleteMany({ where: { OR: [{ id: { in: cartIds } }, { customerId: { in: customerIds } }] } });
    await prisma.customerSession.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    console.log(`\n${pass} passed, ${fail} failed`);
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  }
})();
