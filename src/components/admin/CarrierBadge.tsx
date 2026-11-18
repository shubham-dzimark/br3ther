import type { Carrier } from "@/lib/carriers";

/**
 * Carrier "logo": a monogram tile in the carrier's colour plus its name.
 * Drawn rather than bundled so it stays on-brand and carries no third-party
 * trademark assets.
 */
export function CarrierBadge({
  carrier,
  size = "md",
  showName = true,
}: {
  carrier: Carrier;
  size?: "sm" | "md";
  showName?: boolean;
}) {
  const box = size === "sm" ? "h-7 w-7 text-[10px]" : "h-10 w-10 text-xs";

  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-lg font-bold tracking-tight text-[var(--on-colour)] ${box}`}
        style={{ background: carrier.colour }}
      >
        {carrier.monogram}
      </span>
      {showName ? (
        <span className="text-sm font-medium text-slate-900">{carrier.name}</span>
      ) : null}
    </span>
  );
}
