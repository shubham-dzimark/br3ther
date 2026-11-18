import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionToast } from "@/components/admin/ActionToast";
import { SubmitLoader } from "@/components/admin/SubmitLoader";
import { requireAdmin } from "@/lib/auth";
import { getSecurityConfig } from "@/lib/login-guard";
import { AdminIdleGuard } from "@/components/admin/AdminIdleGuard";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { sanitizeCustomCss } from "@/lib/custom-css";
import { Sidebar } from "@/components/admin/Sidebar";
import { capabilitiesFor } from "@/lib/permissions";
import { Topbar } from "@/components/admin/Topbar";
import { unreadCount, recentNotifications } from "@/lib/notifications";
import { pushAvailable } from "@/lib/push";
import { cookies } from "next/headers";
import { adminFontVariables } from "@/lib/admin-fonts";
import { ADMIN_SCHEME_COOKIE, parseSchemePref, SCHEME_BOOT_SCRIPT } from "@/lib/admin-scheme";
import "@/components/admin/contact-sheet.css";

export const metadata: Metadata = {
  /* Was hardcoded to a shop name, so every admin tab carried it no matter
     whose store it was. */
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * The layout wraps the enrolment page too, so it must not enforce enrolment
   * itself - it would redirect before that page could render. Each page and
   * action inside enforces via requireAdmin/requireCapability, which is where
   * the rule actually belongs.
   */
  const user = await requireAdmin({ allowUnenrolled: true });
  const caps = capabilitiesFor(user.role);
  const seesInbox = caps.includes("support");

  const [unread, notices, settings, chatUnread, chatNotices, security] =
    await Promise.all([
      unreadCount("system"),
      recentNotifications("system"),
      getSettings(),
      // Skipped entirely for roles that cannot open the inbox, rather than
      // fetched and hidden - no point counting what they may not see.
      seesInbox ? unreadCount("chat") : Promise.resolve(0),
      seesInbox ? recentNotifications("chat") : Promise.resolve([]),
      getSecurityConfig().catch(() => ({ idleMinutes: 30 })),
    ]);

  const asNotice = (n: (typeof notices)[number]) => ({
    ...n,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  });

  const adminCss = sanitizeCustomCss(settings[SETTING_KEYS.adminCustomCss]);

  /*
   * Contact Sheet theme (contact-sheet.css, DESIGN.md). Light or dark is this
   * browser's own choice, kept in a cookie; with no choice it follows the OS.
   * The server renders light for "auto" and the boot script below switches to
   * dark before the first paint when the OS asks for it, which is why the root
   * suppresses the hydration warning for its own attributes.
   */
  const schemePref = parseSchemePref((await cookies()).get(ADMIN_SCHEME_COOKIE)?.value);

  return (
    <div
      /* `data-admin` scopes the tokens to the admin only; `data-cs` selects
         the Contact Sheet theme. */
      data-admin=""
      data-cs=""
      data-scheme={schemePref === "dark" ? "dark" : "light"}
      data-scheme-pref={schemePref}
      suppressHydrationWarning
      className={`flex min-h-screen bg-[var(--admin-canvas)] print:block print:bg-white ${adminFontVariables}`}
    >
      <script dangerouslySetInnerHTML={{ __html: SCHEME_BOOT_SCRIPT }} />
      {adminCss ? (
        <style
          data-source="admin-custom-css"
          dangerouslySetInnerHTML={{ __html: adminCss }}
        />
      ) : null}
      {/* "Saved" / "Deleted" / error toast, and a spinner on the pressed button, for every admin action. */}
      <Suspense fallback={null}>
        <ActionToast />
        <SubmitLoader />
      </Suspense>
      {/* Warns, then signs out, after the configured minutes without use. */}
      <AdminIdleGuard idleMinutes={security.idleMinutes} />
      <Sidebar
        caps={caps}
        brand={{
          text:
            settings[SETTING_KEYS.adminBrandText] ||
            settings[SETTING_KEYS.storeName] ||
            "Br3thr",
          logoUrl: settings[SETTING_KEYS.adminLogoUrl],
          mode: settings[SETTING_KEYS.adminBrandMode],
          crest: "/br3thr/icon-reversed.svg",
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          schemePref={schemePref}
          messages={
            seesInbox
              ? { unread: chatUnread, items: chatNotices.map(asNotice) }
              : null
          }
          notifications={{
            unread,
            items: notices.map(asNotice),
            pushEnabled: pushAvailable(),
            vapidKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
          }}
        />
        <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 p-4 md:px-7 md:py-6 print:max-w-none print:p-0">
          {children}
        </main>

        {/* The new-order card is off.
            It opened a third permanent connection from every admin tab - on
            top of the two the bell and the inbox already hold - and with it
            mounted the admin froze while pages were being opened. Taking it
            out puts the tab back to two, which is the state the shop
            confirmed was working. It comes back once it can share one
            connection with the bell instead of adding its own. */}
      </div>
    </div>
  );
}
