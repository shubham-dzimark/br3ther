"use client";

import Link from "next/link";
import {
  IconBan,
  IconCheck,
  IconClipboard,
  IconDots,
  IconEye,
  IconInvoice,
  IconMail,
  IconPin,
} from "./Icons";

/*
 * The eight-button cluster in the order list's Action column, so a day's
 * fulfilment can be done from the list instead of opening every order.
 *
 * Two rows of four: status changes on top, documents and navigation below.
 * A button whose action would be a no-op (marking an already-processing order
 * processing, cancelling an already-cancelled one) is disabled rather than
 * hidden, so the grid never reflows and the same icon is always in the same
 * place down the column - which is what makes it fast to use.
 */

const tile =
  "relative flex h-8 w-8 items-center justify-center rounded-lg border transition";
const enabled =
  "border-slate-200 bg-white text-slate-500 hover:border-[var(--admin-accent)] hover:bg-[var(--admin-btn)] hover:text-[var(--admin-btn-ink)]";
const danger =
  "border-slate-200 bg-white text-slate-400 hover:border-red-300 hover:bg-red-500 hover:text-[var(--on-colour)]";
const off = "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300";

/**
 * CSS-only tooltip above the tile, matching the admin's dark chip styling.
 *
 * Anchored to the tile's right edge rather than centred on it. This grid is
 * the last column of the table, so a centred tooltip on the rightmost icon
 * hung past the container - and because the table scrolls horizontally, that
 * overhang made a scrollbar appear the moment you hovered "Cancel order".
 */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full right-0 z-20 mb-1.5 hidden whitespace-nowrap adm-tip rounded-md bg-[#111214] px-2.5 py-1.5 text-[11px] font-medium text-[#f6f3ee] shadow-lg group-hover:block"
    >
      {children}
    </span>
  );
}

function Tile({
  label,
  disabled,
  tone = "normal",
  children,
}: {
  label: string;
  disabled?: boolean;
  tone?: "normal" | "danger";
  children: React.ReactNode;
}) {
  return (
    <span className="group relative">
      <Tip>{label}</Tip>
      <span
        className={`${tile} ${
          disabled ? off : tone === "danger" ? danger : enabled
        }`}
      >
        {children}
      </span>
    </span>
  );
}

/** A status button: its own form, so one click is one POST. */
function StatusButton({
  action,
  orderId,
  status,
  back,
  label,
  disabled,
  confirm,
  tone,
  children,
}: {
  action: (fd: FormData) => void | Promise<void>;
  orderId: string;
  status: string;
  back: string;
  label: string;
  disabled: boolean;
  confirm?: string;
  tone?: "normal" | "danger";
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Tile label={label} disabled>
        {children}
      </Tile>
    );
  }
  return (
    <form
      action={action}
      className="group relative"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="back" value={back} />
      <Tip>{label}</Tip>
      <button
        type="submit"
        aria-label={label}
        className={`${tile} ${tone === "danger" ? danger : enabled}`}
      >
        {children}
      </button>
    </form>
  );
}

function LinkTile({
  href,
  label,
  newTab,
  tone,
  children,
}: {
  href: string;
  label: string;
  newTab?: boolean;
  tone?: "normal" | "danger";
  children: React.ReactNode;
}) {
  const cls = `${tile} ${tone === "danger" ? danger : enabled}`;
  return (
    <span className="group relative">
      <Tip>{label}</Tip>
      {newTab ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className={cls}
        >
          {children}
        </a>
      ) : (
        <Link href={href} aria-label={label} className={cls}>
          {children}
        </Link>
      )}
    </span>
  );
}

export function OrderRowActions({
  action,
  orderId,
  orderLabel,
  status,
  back,
  email,
  trackingHref,
}: {
  action: (fd: FormData) => void | Promise<void>;
  orderId: string;
  orderLabel: string;
  status: string;
  back: string;
  /** Omitted for roles without customer_pii, which hides the email button. */
  email?: string | null;
  /** Carrier deep link when tracking exists; null sends staff to the order. */
  trackingHref?: string | null;
}) {
  const closed = status === "CANCELLED" || status === "REFUNDED" || status === "FAILED";

  return (
    <div className="ml-auto grid w-fit grid-cols-4 gap-1.5">
      <StatusButton
        action={action}
        orderId={orderId}
        status="PROCESSING"
        back={back}
        label="Processing"
        disabled={status === "PROCESSING" || closed}
      >
        <IconDots className="h-4 w-4" />
      </StatusButton>

      <StatusButton
        action={action}
        orderId={orderId}
        status="DELIVERED"
        back={back}
        label="Complete"
        disabled={status === "DELIVERED" || closed}
      >
        <IconCheck className="h-4 w-4" />
      </StatusButton>

      {email ? (
        <LinkTile
          href={`mailto:${email}?subject=${encodeURIComponent(
            `Your order ${orderLabel}`,
          )}`}
          label="Email customer"
        >
          <IconMail className="h-4 w-4" />
        </LinkTile>
      ) : (
        <Tile label="Email customer" disabled>
          <IconMail className="h-4 w-4" />
        </Tile>
      )}

      {trackingHref ? (
        <LinkTile href={trackingHref} label="Track shipment" newTab>
          <IconPin className="h-4 w-4" />
        </LinkTile>
      ) : (
        <LinkTile href={`/admin/orders/${orderId}#tracking`} label="Add tracking">
          <IconPin className="h-4 w-4" />
        </LinkTile>
      )}

      <LinkTile
        href={`/admin/orders/${orderId}/invoice`}
        label="Print invoice"
        newTab
      >
        <IconInvoice className="h-4 w-4" />
      </LinkTile>

      <LinkTile
        href={`/admin/orders/${orderId}/slip`}
        label="Print packing slip"
        newTab
      >
        <IconClipboard className="h-4 w-4" />
      </LinkTile>

      <LinkTile href={`/admin/orders/${orderId}`} label="View order">
        <IconEye className="h-4 w-4" />
      </LinkTile>

      <StatusButton
        action={action}
        orderId={orderId}
        status="CANCELLED"
        back={back}
        label="Cancel order"
        tone="danger"
        disabled={closed}
        confirm={`Cancel order ${orderLabel}?\n\nIf it was paid, this also reverses the points, referral reward and stock.`}
      >
        <IconBan className="h-4 w-4" />
      </StatusButton>
    </div>
  );
}
