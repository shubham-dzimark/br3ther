"use client";

import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { Capability } from "@/lib/permissions";
import {
  IconBadge,
  IconBolt,
  IconBolt2,
  IconBook,
  IconBook2,
  IconBoxes,
  IconCard,
  IconCartUp,
  IconCategories,
  IconChart,
  IconChat,
  IconClipboard,
  IconCoins,
  IconCoupon,
  IconGiftCard,
  IconCustomers,
  IconDashboard,
  IconDatabase,
  IconFile,
  IconFlask,
  IconFooter,
  IconHeader,
  IconGift,
  IconGlobe,
  IconHeadset,
  IconHome,
  IconIdCard,
  IconImage,
  IconKey,
  IconMail,
  IconMegaphone,
  IconOrders,
  IconPalette,
  IconPercent,
  IconPopup,
  IconProducts,
  IconReceipt,
  IconRobot,
  IconSeo,
  IconSettings,
  IconShare,
  IconShield,
  IconStar,
  IconStore,
  IconTrendingUp,
  IconTrendingUp2,
  IconTrophy,
  IconUserCheck,
  IconWheel,
  IconWithdraw,
  IconWrench,
} from "./Icons";

/*
 * The menu links do not prefetch. Every admin page is dynamic, so each link in
 * view asked the server to render its page in the background - about sixty
 * renders on every navigation - and the page actually clicked queued behind
 * them, which read as a click that did nothing. Instead the clicked link shows
 * a spinner until its page arrives. (Same as the NL shop.)
 */
function NavPending() {
  const { pending } = useLinkStatus();
  return pending ? (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ) : null;
}

type Child = { href: string; label: string; cap?: Capability };
type Item = {
  cap?: Capability;
  href?: string;
  label: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  children?: Child[];
};
type Section = { group: string | null; cap?: Capability; items: Item[] };

const NAV: Section[] = [
  {
    group: null,
    cap: "reports" as const,
    items: [{ href: "/admin", label: "Dashboard", Icon: IconDashboard }],
  },
  {
    group: "Product management",
    cap: "catalog" as const,
    items: [
      {
        label: "Manage Product",
        Icon: IconProducts,
        children: [
          { href: "/admin/products", label: "All Products" },
          { href: "/admin/products?status=DRAFT", label: "Draft Products" },
          { href: "/admin/products/labels", label: "Barcode Labels" },
          { href: "/admin/products/scan", label: "Scan Lookup" },
          { href: "/admin/products/bulk-pricing", label: "Bulk Pricing" },
          { href: "/admin/products/bundle-save", label: "Bundle & Save" },
        ],
      },
      {
        label: "Categories",
        Icon: IconCategories,
        children: [
          { href: "/admin/categories", label: "Categories" },
          { href: "/admin/attributes", label: "Attributes" },
        ],
      },
      { href: "/admin/inventory", label: "Manage Inventory", Icon: IconBoxes },
      // Reviews are about products, so they sit here rather than under
      // Content. The page itself is gated on "content", so the item
      // carries that capability instead of inheriting the group's.
      { href: "/admin/reviews", label: "Reviews", Icon: IconStar, cap: "content" as const },
    ],
  },
  {
    group: "Order management",
    cap: "orders" as const,
    items: [
      {
        label: "Orders",
        Icon: IconOrders,
        children: [
          { href: "/admin/orders", label: "All Orders" },
          { href: "/admin/refunds", label: "Return & Refund" },
          { href: "/admin/orders/shipping", label: "Labels & Tracking" },
          { href: "/admin/orders/carriers", label: "Shipping Carriers", cap: "settings" as const },
          { href: "/admin/abandoned-carts", label: "Abandoned Cart", cap: "reports" as const },
          { href: "/admin/transactions", label: "Transactions", cap: "finance" as const },
        ],
      },
    ],
  },
  {
    group: "Reports & analytics",
    cap: "reports" as const,
    items: [
      { href: "/admin/reports/sales", label: "Sales Reports", Icon: IconChart },
      { href: "/admin/reports/products", label: "Top Products", Icon: IconTrophy },
    ],
  },
  {
    group: "Finance management",
    cap: "finance" as const,
    items: [
      { href: "/admin/finance/earnings", label: "Earning", Icon: IconTrendingUp },
      { href: "/admin/finance/withdraws", label: "Withdraws", Icon: IconWithdraw },
      { href: "/admin/finance/tax", label: "Tax", Icon: IconReceipt },
    ],
  },
  {
    group: "User management",
    cap: "customers" as const,
    items: [
      { href: "/admin/users", label: "Admins", Icon: IconKey, cap: "admins" as const },
      { href: "/admin/staff", label: "Staff", Icon: IconUserCheck, cap: "admins" as const },
      { href: "/admin/customers", label: "Customers", Icon: IconCustomers },
      { href: "/admin/referrals", label: "Referrals", Icon: IconShare },
      { href: "/admin/member-points", label: "Member Points", Icon: IconCoins },
    ],
  },
  {
    group: "Promotional deals",
    cap: "promotions" as const,
    items: [
      { href: "/admin/promotions/coupons", label: "Coupon", Icon: IconCoupon },
      { href: "/admin/promotions/gift-cards", label: "Gift Cards", Icon: IconGiftCard },
      { href: "/admin/promotions/gifts", label: "Free Gifts", Icon: IconGift },
      { href: "/admin/promotions/flash-sales", label: "Flash Sales", Icon: IconBolt },
      { href: "/admin/promotions/checkout-upsell", label: "Upsell Campaigns", Icon: IconCartUp },
      { href: "/admin/promotions/featured", label: "Featured Deal", Icon: IconBadge },
      { href: "/admin/promotions/clearance", label: "Clearance Deal", Icon: IconPercent },
      // The popup is a promotion, but its page is gated on "content", so
      // the item carries that rather than inheriting the group's.
      { href: "/admin/content/promo-popup", label: "Promo Popup", Icon: IconPopup, cap: "content" as const },
      { href: "/admin/content/announcement", label: "Announcement Bar", Icon: IconMegaphone, cap: "content" as const },
    ],
  },
  {
    // Newsletter signups and the emails sent to them. The addresses are
    // contact details, so the item also needs customer_pii.
    group: "Newsletter",
    cap: "promotions" as const,
    items: [
      { href: "/admin/newsletter", label: "Newsletter Signups", Icon: IconMail, cap: "customer_pii" as const },
    ],
  },
  {
    group: "Content management",
    cap: "content" as const,
    items: [
      { href: "/admin/content/home", label: "Home Page Control", Icon: IconHome },
      { href: "/admin/content/product", label: "Product Page", Icon: IconClipboard },
      { href: "/admin/content/spin-win", label: "Spin & Win", Icon: IconWheel },
      { href: "/admin/content/header", label: "Header", Icon: IconHeader },
      { href: "/admin/content/footer", label: "Footer", Icon: IconFooter },
      { href: "/admin/content/age-verification", label: "Age Verification", Icon: IconIdCard },
      { href: "/admin/content/pages", label: "Pages & Policies", Icon: IconFile },
      // Edits the shop's code, so the page itself is Master-only.
      { href: "/admin/content/theme", label: "Theme Editor", Icon: IconPalette },
      { href: "/admin/blog", label: "Blog", Icon: IconBook },
      { href: "/admin/media", label: "Media", Icon: IconImage },
    ],
  },
  {
    // Its own menu (user request): the Lab Results page, its reports and its FAQ.
    group: "Lab results",
    cap: "content" as const,
    items: [{ href: "/admin/lab-results", label: "Lab Results", Icon: IconFlask }],
  },
  {
    group: "Help & support",
    cap: "support" as const,
    items: [
      {
        label: "AI Chat Assistant",
        Icon: IconRobot,
        children: [
          { href: "/admin/support/assistant", label: "Settings" },
          { href: "/admin/support/knowledge", label: "Knowledge Base" },
          { href: "/admin/support/insights", label: "Assistant Insights" },
          { href: "/admin/support/triggers", label: "Chat Triggers" },
        ],
      },
      { href: "/admin/support/inbox", label: "Inbox", Icon: IconChat },
      { href: "/admin/support/tickets", label: "Support & Ticket", Icon: IconHeadset },
    ],
  },
  {
    group: "Settings",
    /*
     * The group opens on the narrower capability, so a role that only styles
     * the shop sees the section at all. Everything sensitive inside carries
     * "settings" explicitly - a group-level cap here would have hidden the
     * design pages from an Editor, and a missing one would have shown them the
     * mailbox password.
     */
    cap: "appearance" as const,
    items: [
      {
        label: "General Settings",
        Icon: IconSettings,
        children: [
          { href: "/admin/settings", label: "General Settings" },
          { href: "/admin/settings/appearance", label: "Appearance" },
          { href: "/admin/settings/fonts", label: "Fonts" },
          { href: "/admin/settings/translations", label: "Translations" },
        ],
      },
      {
        // Barcodes are a shop-floor setting - labels, scanners, slips - not a
        // general one, so they sit under the shop rather than beside Fonts.
        label: "Shop Settings",
        Icon: IconStore,
        cap: "settings" as const,
        children: [
          { href: "/admin/settings/store", label: "Shop Settings" },
          { href: "/admin/settings/shipping", label: "Shipping" },
          { href: "/admin/settings/barcodes", label: "Barcodes" },
        ],
      },
      { href: "/admin/settings/loyalty", label: "Points & Referrals", Icon: IconCoins, cap: "settings" as const },
      {
        // Every gateway switched on or off in one place, each with its own settings.
        label: "Payments",
        Icon: IconCard,
        cap: "settings" as const,
        children: [
          { href: "/admin/settings/payments", label: "Payment gateways" },
          { href: "/admin/settings/payments/emt", label: "Interac e-Transfer" },
          { href: "/admin/settings/payments/crypto", label: "Crypto Payment" },
        ],
      },
      { href: "/admin/settings/seo", label: "SEO Settings", Icon: IconSeo, cap: "settings" as const },
      { href: "/admin/settings/mail", label: "Email Configurations", Icon: IconMail, cap: "settings" as const },
      { href: "/admin/settings/security", label: "Security", Icon: IconShield, cap: "settings" as const },
      { href: "/admin/settings/maintenance", label: "Maintenance", Icon: IconWrench, cap: "settings" as const },
      { href: "/admin/settings/backups", label: "Backup", Icon: IconDatabase, cap: "settings" as const },
    ],
  },
  {
    group: "3rd party setup",
    cap: "settings" as const,
    items: [
      { href: "/admin/integrations/marketing", label: "Marketing Tools", Icon: IconGlobe },
      // Two-way stock sync with the Sortly warehouse.
      { href: "/admin/integrations/sortly", label: "Sortly Inventory", Icon: IconBoxes },
    ],
  },
];

function pathOf(href: string) {
  return href.split("?")[0];
}

function childActive(pathname: string, search: string, href: string): boolean {
  const [p, q] = href.split("?");
  if (pathname !== p) return false;
  return q ? search === q : search === "";
}

function itemActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  if (href === "/admin/settings") return pathname === "/admin/settings";
  const p = pathOf(href);
  return pathname === p || pathname.startsWith(`${p}/`);
}

export function Sidebar({
  search = "",
  caps,
  brand,
}: {
  search?: string;
  caps: readonly Capability[];
  brand: { text: string; logoUrl: string; mode: string; crest?: string | null };
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const allowed = (cap?: Capability) => !cap || caps.includes(cap);
  const visible = NAV
    .filter((section) => allowed(section.cap))
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) => allowed(item.cap))
        // Children carry their own capability where it is narrower than the
        // group's - Transactions and Abandoned cart list customer emails, so a
        // fulfilment role must not see them even though it owns Orders.
        .map((item) => ({
          ...item,
          children: item.children?.filter((child) => allowed(child.cap)),
        }))
        // An item that is only a container for children it can no longer see
        // would render as a dead expander.
        .filter((item) => !item.children || item.children.length > 0),
    }))
    .filter((section) => section.items.length > 0);

  /*
   * Open when the current page is one of the children, or sits beneath one.
   * A plain startsWith would be wrong now that a child can be a prefix of its
   * siblings' section: "/admin/settings" would then match "/admin/settings/mail"
   * and hold General Settings open on every settings page.
   */
  const isOpenByDefault = (item: Item) =>
    !!item.children?.some((c) => {
      const base = pathOf(c.href);
      return pathname === base || pathname.startsWith(`${base}/`);
    });

  // A tap that navigates should also dismiss the drawer.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, search]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  const renderNav = (isCollapsed: boolean) => (
    <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-8">
      {visible.map((section, i) => (
        <div key={section.group ?? `g${i}`} className="mb-4">
          {section.group && !isCollapsed ? (
            <p className="adm-rail-label mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.11em]">
              {section.group}
            </p>
          ) : null}
          <ul className="space-y-1">
            {section.items.map((item) =>
              item.children ? (
                <NavGroup
                  key={item.label}
                  item={item}
                  collapsed={isCollapsed}
                  pathname={pathname}
                  search={search}
                  defaultOpen={isOpenByDefault(item)}
                />
              ) : (
                <li key={item.href}>
                  <Link
                    prefetch={false}
                    href={item.href!}
                    title={isCollapsed ? item.label : undefined}
                    aria-current={itemActive(pathname, item.href!) ? "page" : undefined}
                    data-active={itemActive(pathname, item.href!)}
                    className={`adm-rail-item flex items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] font-medium transition ${
                      isCollapsed ? "justify-center" : ""
                    }`}
                  >
                    <item.Icon className="h-[21px] w-[21px] shrink-0" />
                    {!isCollapsed && item.label}
                    {!isCollapsed && <NavPending />}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <aside
        className={`adm-rail relative hidden shrink-0 transition-[width] duration-200 md:block print:hidden ${
          collapsed ? "w-[72px]" : "w-[244px]"
        }`}
      >
        <div className="sticky top-0 z-30 flex h-screen flex-col">
          {brand.crest ? (
            /* The Br3thr seal beside the wordmark; the seal alone when collapsed. */
            <Link
              href="/admin"
              aria-label={`${brand.text} admin, dashboard`}
              className={`mx-3 mb-3 flex items-center border-b border-[var(--rail-line)] transition hover:opacity-90 ${collapsed ? "justify-center pb-3 pt-4" : "gap-3 px-2 pb-4 pt-5"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brand.crest} alt="" className={collapsed ? "h-10 w-10" : "h-11 w-11 shrink-0"} />
              {!collapsed ? (
                <span className="flex flex-col gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/br3thr/wordmark-reversed.svg" alt={brand.text} className="h-5 w-auto self-start" />
                  <span className="adm-mono text-[11px] uppercase text-[var(--rail-label)]">Admin</span>
                </span>
              ) : null}
            </Link>
          ) : (
          <Link
            href="/admin"
            className="mx-3 mb-2 mt-4 flex items-center gap-2.5 rounded-[10px] px-2 py-2 text-[var(--on-colour)] transition hover:bg-white/5"
          >
            {brand.mode !== "text" ? (
              brand.logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={brand.logoUrl}
                  alt={brand.text}
                  className="h-8 w-8 shrink-0 rounded-[9px] bg-white object-contain"
                />
              ) : (
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[15px] font-bold text-[var(--on-colour)]"
                  style={{ backgroundColor: "var(--admin-accent)" }}
                >
                  {brand.text.charAt(0).toUpperCase()}
                </span>
              )
            ) : null}
            {!collapsed && brand.mode !== "image" ? (
              <span className="adm-display truncate text-[15px] font-semibold">
                {brand.text}
              </span>
            ) : null}
          </Link>
          )}

          {renderNav(collapsed)}

          {/*
           * Lives inside the sticky column, not the <aside>: the aside is as
           * tall as the page, so an absolutely-positioned button on it scrolled
           * away with the content. The sticky element is a containing block,
           * so the toggle now holds its place at any scroll position.
           */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            /* Was hardcoded to the old teal. Follows the shop's accent now. */
            className="adm-focus absolute -right-[12px] top-[22px] z-40 flex h-[24px] w-[24px] items-center justify-center rounded-full border border-[var(--admin-line-strong)] bg-[var(--admin-surface)] text-slate-500 shadow-[var(--admin-shadow)] transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-3.5 w-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`}
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>
      </aside>

      {/*
       * Mobile navigation.
       *
       * This used to be a horizontally scrolling strip of every menu item
       * flattened into one row - fifty-odd links you had to swipe through, and
       * as a flex sibling of the rail it took a column of its own beside the
       * content. It is now a drawer holding the same tree as the desktop rail,
       * so nothing is unreachable on a phone.
       */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        aria-expanded={mobileOpen}
        className="adm-focus fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--admin-line-strong)] bg-[var(--admin-surface)] text-slate-700 shadow-[var(--admin-shadow)] md:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 h-full w-full bg-[rgba(15,14,12,0.6)] backdrop-blur-[2px]"
          />
          <div className="adm-rail absolute inset-y-0 left-0 flex w-[272px] max-w-[85vw] flex-col shadow-2xl">
            <div className="flex items-center justify-between gap-2 px-5 py-4">
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className="flex min-w-0 items-center gap-2.5 text-[var(--on-colour)]"
              >
                {brand.crest ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={brand.crest} alt={brand.text} className="h-12 w-auto" />
                ) : brand.mode !== "text" ? (
                  brand.logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={brand.logoUrl}
                      alt={brand.text}
                      className="h-9 w-9 shrink-0 rounded-full bg-white object-contain"
                    />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-base font-bold text-[var(--admin-sidebar)]">
                      {brand.text.charAt(0).toLowerCase()}
                    </span>
                  )
                ) : null}
                {!brand.crest && brand.mode !== "image" ? (
                  <span className="truncate text-lg font-semibold tracking-tight">
                    {brand.text}
                  </span>
                ) : null}
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--on-colour)]/80 transition hover:bg-white/10 hover:text-[var(--on-colour)]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            {renderNav(false)}
          </div>
        </div>
      ) : null}

    </>
  );
}

function NavGroup({
  item,
  collapsed,
  pathname,
  search,
  defaultOpen,
}: {
  item: Item;
  collapsed: boolean;
  pathname: string;
  search: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const anyActive = item.children!.some((c) => pathname.startsWith(pathOf(c.href)));

  if (collapsed) {
    return (
      <li>
        <Link
          prefetch={false}
          href={item.children![0].href}
          title={item.label}
          data-active={anyActive}
          className="adm-rail-item flex items-center justify-center rounded-[10px] px-3 py-2 transition"
        >
          <item.Icon className="h-[20px] w-[20px]" />
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-active={undefined}
        className={`adm-rail-item flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] font-medium transition ${
          anyActive ? "bg-white/[0.07] !text-[var(--on-colour)]" : ""
        }`}
      >
        <item.Icon className="h-[20px] w-[20px] shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        /* A continuous connector rail rather than a dot per child: the active
           one brightens its own segment. At white/10 the line vanished against
           a dark sidebar, so an open group read as a flat list with no tie back
           to its parent - it runs off --rail-rule now, set per scheme. */
        <ul className="relative ml-[25px] mt-1 space-y-0.5 border-l border-[var(--rail-rule)] pl-3">
          {item.children!.map((c) => {
            const active = childActive(pathname, search, c.href);
            return (
              <li key={c.href} className="relative">
                {active ? (
                  <span
                    aria-hidden
                    className="absolute -left-[13px] top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: "var(--admin-accent)" }}
                  />
                ) : null}
                <Link
                  prefetch={false}
                  href={c.href}
                  aria-current={active ? "page" : undefined}
                  data-active={active}
                  className="adm-rail-item adm-rail-sub flex items-center gap-2 rounded-[8px] px-3 py-1.5 text-[13.5px] transition"
                >
                  {c.label}
                  <NavPending />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}
