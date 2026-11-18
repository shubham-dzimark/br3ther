"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import { Field, fieldInput } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import {
  MAX_TIERS,
  sanitizeTiers,
  tierProblems,
  tierUnitPrice,
  type QuantityTier,
} from "@/lib/quantity-tiers";

type Row = { qty: string; percent: string; badge: string };

/**
 * The rows of one Bundle & Save rule, with a worked example on a $100 item and
 * a warning when a bigger quantity would cost the same as a smaller one. The
 * submit button stays off until the rule makes sense; the server checks again.
 */
export function BundleRuleEditor({
  defaultTiers,
  submitLabel,
  currency,
  locale,
}: {
  defaultTiers: QuantityTier[];
  submitLabel: string;
  currency: string;
  locale: string;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: MAX_TIERS }, (_, i) => {
      const t = defaultTiers[i];
      return t ? { qty: String(t.qty), percent: String(t.percent), badge: t.badge } : { qty: "", percent: "", badge: "" };
    }),
  );

  const tiers = sanitizeTiers(rows.filter((r) => r.qty.trim() !== ""));
  const problems = tierProblems(tiers);
  const hasDiscount = tiers.some((t) => t.percent > 0);
  const money = (cents: number) => formatMoney(cents, currency, locale);
  const EXAMPLE = 100_00;

  const set = (i: number, field: keyof Row, value: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [field]: value } : r)));

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Buy (quantity)" htmlFor={`tierQty_${i}`}>
              <input
                id={`tierQty_${i}`}
                name={`tierQty_${i}`}
                type="number"
                min="1"
                max="100"
                step="1"
                value={row.qty}
                onChange={(e) => set(i, "qty", e.target.value)}
                placeholder={String(i + 1)}
                className={fieldInput}
              />
            </Field>
            <Field label="% off each" htmlFor={`tierPct_${i}`}>
              <input
                id={`tierPct_${i}`}
                name={`tierPct_${i}`}
                type="number"
                min="0"
                max="90"
                step="1"
                value={row.percent}
                onChange={(e) => set(i, "percent", e.target.value)}
                placeholder={i === 0 ? "0" : String(i * 10)}
                className={fieldInput}
              />
            </Field>
            <Field label="Badge (optional)" htmlFor={`tierBadge_${i}`}>
              <input
                id={`tierBadge_${i}`}
                name={`tierBadge_${i}`}
                maxLength={30}
                value={row.badge}
                onChange={(e) => set(i, "badge", e.target.value)}
                placeholder={i === 1 ? "Most Popular" : ""}
                className={fieldInput}
              />
            </Field>
          </div>
        ))}
      </div>

      {problems.length > 0 ? (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      ) : null}

      {hasDiscount ? (
        <div className="rounded-2xl bg-slate-50 px-5 py-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            How it looks on a {money(EXAMPLE)} item
          </p>
          <ul className="space-y-1.5 text-sm">
            {[{ qty: 1, percent: 0, badge: tiers.find((t) => t.qty === 1)?.badge ?? "" }, ...tiers.filter((t) => t.qty > 1)].map(
              (t) => {
                const each = tierUnitPrice(EXAMPLE, t.percent);
                return (
                  <li key={t.qty} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-slate-700">
                      Buy {t.qty}
                      {t.percent > 0 ? <span className="ml-2 font-semibold text-[var(--admin-accent)]">save {t.percent}%</span> : null}
                      {t.badge ? (
                        <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">{t.badge}</span>
                      ) : null}
                    </span>
                    <span className="tabular-nums text-slate-900">
                      <strong className="font-semibold">{money(each * t.qty)}</strong>
                      {t.qty > 1 ? <span className="ml-1.5 text-xs text-slate-500">({money(each)} each)</span> : null}
                    </span>
                  </li>
                );
              },
            )}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Add at least one row with a quantity of 2 or more and a discount.</p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!hasDiscount || problems.length > 0}
          className={`${btnPrimary} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
