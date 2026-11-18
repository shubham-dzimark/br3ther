import Link from "next/link";
import { logoutAction } from "@/app/admin/actions";
import { ProfileMenu } from "./ProfileMenu";
import { ROLE_LABELS } from "@/lib/permissions";
import { AdminSearch } from "./AdminSearch";
import { NotificationBell, type AdminNotice } from "./NotificationBell";
import { SchemeToggle } from "./SchemeToggle";
import type { AdminSchemePref } from "@/lib/admin-scheme";

export function Topbar({
  user,
  notifications,
  messages,
  schemePref,
}: {
  user: { name: string; email: string; role: string };
  /** This browser's light / dark / auto choice. */
  schemePref: AdminSchemePref;
  /** Live-chat notifications. Null hides the icon for roles that cannot open
   *  the inbox at all. */
  messages: { unread: number; items: AdminNotice[] } | null;
  notifications: {
    unread: number;
    items: AdminNotice[];
    pushEnabled: boolean;
    vapidKey: string;
  };
}) {
  const initials =
    user.name
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "A";

  return (
    /*
     * A white band separated by a hairline, sitting between the coloured rail
     * and the canvas. It stays opaque rather than translucent: against a solid
     * rail, a blurred bar made the boundary between the two look smudged.
     */
    <header className="sticky top-0 z-20 flex h-[58px] items-center gap-2 border-b border-[var(--admin-line)] bg-[var(--admin-surface)] pl-16 pr-3 md:gap-3 md:px-6 print:hidden">
      <AdminSearch />

      <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2.5">
        <SchemeToggle initial={schemePref} />

        {/* The shop in a new tab, so the admin page being worked on stays put. */}
        <Link
          href="/"
          target="_blank"
          rel="noopener"
          aria-label="View store"
          className="adm-focus adm-view-store mr-1 inline-flex h-9 items-center gap-2 rounded-[var(--admin-radius-sm)] border border-[var(--admin-line-strong)] px-2.5 text-[13px] font-semibold text-slate-700 transition hover:bg-[var(--admin-inset)] md:mr-2 md:px-3.5"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
            <path d="M3 9.5 4.5 4h15L21 9.5M3 9.5h18M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 12.5V20h14v-7.5M10 20v-5h4v5" />
          </svg>
          <span className="hidden sm:inline">View store</span>
        </Link>

        {/*
         * Messages and notifications are different things, so they get
         * different shapes, different badge colours and separate counts - a
         * speech bubble in amber for live chat, a bell in red for alerts.
         */}
        {messages ? (
          <NotificationBell
            kind="chat"
            initialUnread={messages.unread}
            initialItems={messages.items}
            pushEnabled={false}
            vapidKey=""
          />
        ) : null}

        <NotificationBell
          initialUnread={notifications.unread}
          initialItems={notifications.items}
          pushEnabled={notifications.pushEnabled}
          vapidKey={notifications.vapidKey}
        />

        <ProfileMenu
          user={{ name: user.name, email: user.email }}
          initials={initials}
          roleLabel={ROLE_LABELS[user.role] ?? user.role}
          logoutAction={logoutAction}
        />
      </div>
    </header>
  );
}
