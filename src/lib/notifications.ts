import "server-only";
import { prisma } from "@/lib/prisma";
import type { AdminNotificationType } from "@/generated/prisma";
import { sendPushToAdmins } from "@/lib/push";

/**
 * Admin notifications.
 *
 * Stored rather than derived, so they can be marked read, survive the event
 * that caused them, and be delivered by push to a browser that isn't open.
 * Creation never throws into the caller: a notification failing must not roll
 * back the order it was reporting.
 */
export async function notifyAdmins(input: {
  type: AdminNotificationType;
  title: string;
  body?: string;
  href?: string;
}): Promise<void> {
  try {
    await prisma.adminNotification.create({
      data: {
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        href: input.href ?? null,
      },
    });
    // Push is best-effort and must not hold up the request that triggered it.
    void sendPushToAdmins({
      title: input.title,
      body: input.body,
      href: input.href,
    }).catch(() => undefined);
  } catch {
    // Deliberately swallowed - see above.
  }
}

/**
 * Which notification types belong to the chat menu rather than the bell.
 *
 * Live chat is a conversation you reply to, not an alert you acknowledge, so
 * it gets its own icon and its own unread count - mixing the two buried real
 * alerts under a run of chat messages.
 */
export const CHAT_TYPES = ["SUPPORT_MESSAGE"] as const;

/**
 * Orders, among everything else the bell carries.
 *
 * They are the ones worth interrupting someone for, so they ring the bell
 * sound and raise a card in the corner; the rest of the bell's notifications
 * arrive quietly.
 */
export { ORDER_TYPES } from "@/lib/notification-types";

export type NoticeKind = "chat" | "system";

export function kindWhere(kind: NoticeKind) {
  return kind === "chat"
    ? { type: { in: [...CHAT_TYPES] } }
    : { type: { notIn: [...CHAT_TYPES] } };
}

export function parseKind(value: unknown): NoticeKind {
  return value === "chat" ? "chat" : "system";
}

export async function unreadCount(kind: NoticeKind): Promise<number> {
  return prisma.adminNotification.count({
    where: { readAt: null, ...kindWhere(kind) },
  });
}

export async function recentNotifications(kind: NoticeKind, take = 15) {
  return prisma.adminNotification.findMany({
    where: kindWhere(kind),
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      href: true,
      readAt: true,
      createdAt: true,
    },
  });
}
