import { prisma } from "@/lib/prisma";
import { getApiAdmin } from "@/lib/auth";
import { kindWhere, parseKind, type NoticeKind } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * Server-sent events for the admin bell.
 *
 * SSE rather than websockets: this is one-way, it survives the Apache reverse
 * proxy, and it reconnects on its own. The server polls the database on a short
 * interval and only writes when something actually changed, so an idle admin
 * costs one cheap count query every few seconds and no traffic.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getApiAdmin();
  if (!user) return new Response("unauthorized", { status: 401 });

  const kind: NoticeKind = parseKind(new URL(request.url).searchParams.get("kind"));
  const scope = kindWhere(kind);

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      let lastSignature = "";

      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const tick = async () => {
        try {
          const [unread, latest] = await Promise.all([
            prisma.adminNotification.count({
              where: { readAt: null, ...scope },
            }),
            prisma.adminNotification.findFirst({
              where: scope,
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                type: true,
                title: true,
                body: true,
                href: true,
                createdAt: true,
              },
            }),
          ]);

          const signature = `${unread}:${latest?.id ?? ""}`;
          if (signature === lastSignature) return;
          const isFirst = lastSignature === "";
          lastSignature = signature;

          send("update", {
            unread,
            latest,
            // The first message is just state sync - don't pop a toast for it.
            isInitial: isFirst,
          });
        } catch {
          // A transient database blip shouldn't kill the stream; the next tick
          // will pick it up.
        }
      };

      await tick();
      timer = setInterval(tick, 5000);

      request.signal.addEventListener("abort", () => {
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops Apache/mod_proxy buffering the stream into silence.
      "X-Accel-Buffering": "no",
    },
  });
}
