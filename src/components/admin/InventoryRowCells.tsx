import { STOCK_STATUS_OPTIONS } from "@/lib/stock";

const cell =
  "rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-700 outline-none transition focus:border-[var(--admin-accent)]";

/**
 * The inventory controls for one option on the Manage inventory screen: how
 * much of it there is, and what it says it is.
 *
 * Whether stock is counted is one checkbox above the table (`#track-all`), not
 * a tick per row. The quantity box follows it with CSS - shown while it is
 * ticked, a dash otherwise - and stays mounted either way, so the count an
 * option already has is never lost by switching counting off.
 *
 * Backorders are set per option on the product screen, under Edit; this
 * screen neither shows nor posts them, so saving here leaves them as they are.
 */
export function InventoryRowCells({
  variantId,
  label,
  stock,
  stockStatus,
}: {
  variantId: string;
  label: string;
  stock: number;
  stockStatus: string;
}) {
  return (
    <>
      <td className="px-3 py-3 text-right lg:px-5">
        <input
          type="number"
          min="0"
          name={`stock_${variantId}`}
          defaultValue={stock}
          aria-label={`Stock for ${label}`}
          className={`hidden w-24 text-right tabular-nums group-has-[#track-all:checked]:inline-block ${cell}`}
        />
        <span className="text-xs text-slate-400 group-has-[#track-all:checked]:hidden">&mdash;</span>
      </td>

      <td className="px-3 py-3 text-right lg:px-5">
        <select
          name={`stockStatus_${variantId}`}
          defaultValue={stockStatus}
          aria-label={`Stock status for ${label}`}
          className={`w-36 ${cell}`}
        >
          {STOCK_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </td>
    </>
  );
}
