import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { SectionCard } from "@/components/admin/Field";
import { GiftRuleForm } from "@/components/admin/GiftRuleForm";
import { centsToInput } from "@/lib/money";
import { GIFT_RULE_ERRORS, giftFormData } from "../data";
import { deleteGiftRule, updateGiftRule } from "../actions";

export const metadata: Metadata = { title: "Gift offer" };
export const dynamic = "force-dynamic";

export default async function EditGiftRulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireCapability("promotions");
  const [{ id }, { saved, error }] = await Promise.all([params, searchParams]);

  const [rule, form] = await Promise.all([
    prisma.giftRule.findUnique({ where: { id }, include: { gifts: true } }),
    giftFormData(),
  ]);
  if (!rule) notFound();

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/promotions/gifts"
          aria-label="Back to gift offers"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight text-slate-900">
          {rule.name}
        </h1>
      </div>

      {saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Not saved. {GIFT_RULE_ERRORS[error] ?? "Check the offer and try again."}
        </p>
      ) : null}

      <GiftRuleForm
        action={updateGiftRule}
        variants={form.variants}
        products={form.products}
        categories={form.categories}
        submitLabel="Save offer"
        values={{
          id: rule.id,
          name: rule.name,
          isEnabled: rule.isEnabled,
          trigger: rule.trigger,
          minSubtotal: rule.minSubtotalCents ? centsToInput(rule.minSubtotalCents) : "",
          triggerQuantity: rule.triggerQuantity,
          // The lists, or the single product/category an older offer kept.
          triggerProductIds: rule.triggerProductIds.length
            ? rule.triggerProductIds
            : rule.triggerProductId
              ? [rule.triggerProductId]
              : [],
          triggerCategoryIds: rule.triggerCategoryIds.length
            ? rule.triggerCategoryIds
            : rule.triggerCategoryId
              ? [rule.triggerCategoryId]
              : [],
          repeats: rule.repeats,
          couponCode: rule.couponCode ?? "",
          reward: rule.reward,
          maxGifts: rule.maxGifts,
          notice: rule.notice ?? "",
          giftVariantIds: rule.gifts.map((g) => g.variantId),
          sortOrder: rule.sortOrder,
        }}
      />

      <form action={deleteGiftRule}>
        <SectionCard title="Danger zone">
          <input type="hidden" name="id" value={rule.id} />
          <button
            type="submit"
            className="rounded-full border border-red-200 px-5 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            Delete this offer
          </button>
          <p className="mt-3 text-xs text-slate-400">
            Any gift this offer put in a shopper&rsquo;s cart is removed at the
            same time.
          </p>
        </SectionCard>
      </form>
    </div>
  );
}
