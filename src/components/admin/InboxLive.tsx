"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the Inbox current without a refresh.
 *
 * Reuses the notification stream rather than adding a second poller: a
 * customer message already creates an admin notification, so the same event
 * that lights the bell is the signal that this page is stale. Staff replies
 * don't create notifications, so replying doesn't trigger a needless refresh.
 */
export function InboxLive() {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource("/api/admin/notifications/stream");

    source.addEventListener("update", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as {
          isInitial: boolean;
        };
        // The first message is just state sync for a freshly opened stream.
        if (data.isInitial) return;
      } catch {
        // Unparseable payload: refreshing anyway is harmless.
      }
      router.refresh();
    });

    source.onerror = () => {
      // EventSource reconnects on its own; nothing useful to do here.
    };

    return () => source.close();
  }, [router]);

  return null;
}
