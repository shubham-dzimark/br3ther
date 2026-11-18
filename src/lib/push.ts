import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * Web Push for admin notifications.
 *
 * Push reaches a browser whose tab is closed, which the in-page live feed
 * cannot. Subscriptions that the push service rejects as gone (404/410) are
 * deleted, so a stale device doesn't get retried forever.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@br3thr.com";

let configured = false;
function configure(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export function pushAvailable(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

export async function sendPushToAdmins(payload: {
  title: string;
  body?: string;
  href?: string;
}): Promise<{ sent: number; removed: number }> {
  if (!configure()) return { sent: 0, removed: 0 };

  const subs = await prisma.pushSubscription.findMany();
  if (subs.length === 0) return { sent: 0, removed: 0 };

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    href: payload.href ?? "/admin",
  });

  let sent = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          data,
        );
        sent += 1;
        await prisma.pushSubscription
          .update({ where: { id: sub.id }, data: { lastSentAt: new Date() } })
          .catch(() => undefined);
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        // 404/410 mean the browser dropped it - stop trying that device.
        if (status === 404 || status === 410) {
          removed += 1;
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => undefined);
        }
      }
    }),
  );

  return { sent, removed };
}
