import Link from "next/link";
import type { Metadata } from "next";
import { requireCapability } from "@/lib/permissions";
import { GiftRuleForm } from "@/components/admin/GiftRuleForm";
import { GIFT_RULE_ERRORS, giftFormData } from "../data";
import { createGiftRule } from "../actions";

export const metadata: Metadata = { title: "New gift offer" };
export const dynamic = "force-dynamic";

export default async function NewGiftRulePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCapability("promotions");
  const [{ error }, { variants, products, categories }] = await Promise.all([
    searchParams,
    giftFormData(),
  ]);

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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          New gift offer
        </h1>
      </div>

      {error ? (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Not saved. {GIFT_RULE_ERRORS[error] ?? "Check the offer and try again."}
        </p>
      ) : null}

      <GiftRuleForm
        action={createGiftRule}
        variants={variants}
        products={products}
        categories={categories}
        submitLabel="Create offer"
      />
    </div>
  );
}
