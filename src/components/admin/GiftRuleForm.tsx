"use client";

import { useState } from "react";
import { Field, fieldInput, fieldSelect, fieldTextarea, SectionCard } from "./Field";
import { ProductPicker, type PickerOption } from "./ProductPicker";

/*
 * Gift-rule editor. A client component so the form only shows the fields that
 * matter for the chosen trigger and reward - a rule sheet with every option
 * visible at once made it impossible to tell which values were actually in
 * play, which is how you end up with a coupon code sitting on a spend rule.
 */

export type GiftRuleValues = {
  id?: string;
  name?: string;
  isEnabled?: boolean;
  trigger?: "CART_TOTAL" | "BUY_X_GET_Y" | "COUPON";
  minSubtotal?: string;
  triggerQuantity?: number;
  /** The products or categories the offer is limited to; both empty = all products. */
  triggerProductIds?: string[];
  triggerCategoryIds?: string[];
  /** Older single-choice fields: accepted, never read - the lists above replace them. */
  triggerProductId?: string;
  triggerCategoryId?: string;
  repeats?: boolean;
  couponCode?: string;
  reward?: "PRODUCT" | "CHEAPEST_IN_CART" | "FREE_SHIPPING";
  maxGifts?: number;
  notice?: string;
  giftVariantIds?: string[];
  sortOrder?: number;
};

type Scope = "all" | "products" | "categories";

export function GiftRuleForm({
  action,
  values = {},
  variants,
  products,
  categories,
  submitLabel,
}: {
  action: (fd: FormData) => void | Promise<void>;
  values?: GiftRuleValues;
  variants: PickerOption[];
  products: PickerOption[];
  categories: PickerOption[];
  submitLabel: string;
}) {
  const [trigger, setTrigger] = useState(values.trigger ?? "CART_TOTAL");
  const [reward, setReward] = useState(values.reward ?? "PRODUCT");
  const [scope, setScope] = useState<Scope>(
    values.triggerProductIds?.length ? "products" : values.triggerCategoryIds?.length ? "categories" : "all",
  );

  return (
    <form action={action} className="space-y-5">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <input type="hidden" name="sortOrder" value={values.sortOrder ?? 0} />

      <SectionCard title="Offer">
        <div className="space-y-7">
          <Field label="Name (staff only)" htmlFor="name">
            <input
              id="name"
              name="name"
              required
              defaultValue={values.name}
              placeholder="Free tote over $75"
              className={fieldInput}
            />
          </Field>

          <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
            <input
              type="checkbox"
              name="isEnabled"
              defaultChecked={values.isEnabled ?? true}
              className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
            />
            <span className="text-sm text-slate-700">
              Offer is live
              <span className="mt-0.5 block text-xs text-slate-500">
                Turning it off removes the gift from any cart holding it.
              </span>
            </span>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="When it applies">
        <div className="space-y-7">
          <Field label="Trigger" htmlFor="trigger">
            <select
              id="trigger"
              name="trigger"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as typeof trigger)}
              className={fieldSelect}
            >
              <option value="CART_TOTAL">Cart total reaches an amount</option>
              <option value="BUY_X_GET_Y">Buy X, get the gift</option>
              <option value="COUPON">A coupon code is used</option>
            </select>
          </Field>

          {trigger === "CART_TOTAL" ? (
            <Field label="Spend at least" htmlFor="minSubtotal">
              <input
                id="minSubtotal"
                name="minSubtotal"
                inputMode="decimal"
                required
                defaultValue={values.minSubtotal}
                placeholder="75.00"
                className={fieldInput}
              />
            </Field>
          ) : null}

          {trigger === "BUY_X_GET_Y" ? (
            <div>
              <Field label="Minimum quantity to buy" htmlFor="triggerQuantity">
                <input
                  id="triggerQuantity"
                  name="triggerQuantity"
                  type="number"
                  min="1"
                  step="1"
                  required
                  defaultValue={values.triggerQuantity ?? 1}
                  className={fieldInput}
                />
              </Field>
              <p className="mt-2 px-1 text-xs text-slate-500">
                The least they must buy - any number from 1 up. Buying this many
                or more earns the gift, and shoppers can change quantities freely.
              </p>
            </div>
          ) : null}

          {trigger !== "COUPON" ? (
            <div className="space-y-4">
              <Field label="Which products count" htmlFor="scope">
                <select
                  id="scope"
                  name="scope"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as Scope)}
                  className={fieldSelect}
                >
                  <option value="all">All products</option>
                  <option value="products">Specific products</option>
                  <option value="categories">Specific categories</option>
                </select>
              </Field>

              {scope === "products" ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Products</p>
                  <ProductPicker
                    name="triggerProductIds"
                    options={products}
                    defaultValue={values.triggerProductIds}
                    placeholder="Search products…"
                  />
                </div>
              ) : null}

              {scope === "categories" ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Categories</p>
                  <ProductPicker
                    name="triggerCategoryIds"
                    options={categories}
                    defaultValue={values.triggerCategoryIds}
                    placeholder="Search categories…"
                  />
                </div>
              ) : null}

              <p className="px-1 text-xs text-slate-500">
                {trigger === "CART_TOTAL"
                  ? scope === "all"
                    ? "Everything in the cart counts toward the amount."
                    : "Only what is spent on these counts toward the amount."
                  : scope === "all"
                    ? "Any items in the cart count toward the quantity."
                    : "Only items from these count toward the quantity."}
              </p>
            </div>
          ) : null}

          {trigger === "BUY_X_GET_Y" ? (
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input
                type="checkbox"
                name="repeats"
                defaultChecked={values.repeats}
                className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
              />
              <span className="text-sm text-slate-700">
                Repeat the offer
                <span className="mt-0.5 block text-xs text-slate-500">
                  Buy 2 get 1 becomes buy 4 get 2, buy 6 get 3. Off, the gift
                  is granted once however many they buy.
                </span>
              </span>
            </label>
          ) : null}

          {trigger === "COUPON" ? (
            <Field label="Coupon code" htmlFor="couponCode">
              <input
                id="couponCode"
                name="couponCode"
                required
                defaultValue={values.couponCode}
                placeholder="FREEGIFT"
                className={`${fieldInput} uppercase`}
              />
            </Field>
          ) : null}
        </div>

        {trigger === "COUPON" ? (
          <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-500">
            Shoppers enter this code in the discount code box on the cart or at
            checkout. It does not need to exist under Coupons - a code used only
            for this offer is accepted and takes nothing off the price. If it is
            also a discount coupon, the discount and the gift both apply. The gift
            is added to the order when it is placed.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="What they get">
        <div className="space-y-7">
          <Field label="Reward" htmlFor="reward">
            <select
              id="reward"
              name="reward"
              value={reward}
              onChange={(e) => setReward(e.target.value as typeof reward)}
              className={fieldSelect}
            >
              <option value="PRODUCT">A free product</option>
              <option value="FREE_SHIPPING">Free shipping</option>
              <option value="CHEAPEST_IN_CART">Cheapest item in the cart, free</option>
            </select>
          </Field>

          {reward === "CHEAPEST_IN_CART" ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-500">
              The cheapest item is free - the cheapest of the products that count,
              above - once for each time the offer is earned. At least one item
              always stays paid. It shows as a discount on the cart, at checkout
              and on the order.
            </p>
          ) : null}
          {reward === "FREE_SHIPPING" ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-500">
              Shipping is free once the offer applies, shown on the cart and at
              checkout, and charged at nothing on the order.
            </p>
          ) : null}

          {reward === "PRODUCT" ? (
            <>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Gift product</p>
                <ProductPicker
                  name="giftVariantIds"
                  options={variants}
                  defaultValue={values.giftVariantIds?.slice(0, 1)}
                  placeholder="Search the gift product…"
                  single
                />
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  One gift product per offer - picking another replaces it. It is
                  added to the cart automatically once the cart qualifies, shoppers
                  never choose. The gift product is hidden from the shop, search and
                  every listing, can&rsquo;t be bought, and shows a Gift badge under
                  Products. Take it out of the offer and it becomes a normal product
                  again.
                </p>
              </div>

              <Field label="Gift quantity" htmlFor="maxGifts">
                <input
                  id="maxGifts"
                  name="maxGifts"
                  type="number"
                  min="1"
                  step="1"
                  required
                  defaultValue={values.maxGifts ?? 1}
                  className={fieldInput}
                />
              </Field>
              <p className="-mt-4 px-1 text-xs text-slate-500">
                Any quantity from 1 up - there is no maximum. Only the gift&rsquo;s
                stock limits what is added.
              </p>
            </>
          ) : null}

          <Field label="Notice on the cart (optional)" htmlFor="notice">
            <textarea
              id="notice"
              name="notice"
              rows={2}
              defaultValue={values.notice}
              placeholder="Spend {remaining} more for a free tote."
              className={fieldTextarea}
            />
          </Field>
          <p className="-mt-4 px-1 text-xs text-slate-500">
            Cart total offers only - shown on the cart until it reaches the amount.{" "}
            <code className="rounded bg-slate-100 px-1">{"{remaining}"}</code>{" "}
            is replaced with how much more they need to spend.
          </p>
        </div>

        <div className="mt-7 flex justify-end">
          <button
            type="submit"
            className="rounded-full bg-[var(--admin-btn)] px-6 py-2.5 text-sm font-semibold text-[var(--admin-btn-ink)] transition hover:bg-[var(--admin-btn)]"
          >
            {submitLabel}
          </button>
        </div>
      </SectionCard>
    </form>
  );
}
