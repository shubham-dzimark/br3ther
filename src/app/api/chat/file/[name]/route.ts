import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getApiAdmin } from "@/lib/auth";
import { can } from "@/lib/capabilities";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { CHAT_COOKIE, resolveThread } from "@/lib/chat-thread";
import { isChatFileName, mimeForChatFile, readChatFile } from "@/lib/chat-files";

export const dynamic = "force-dynamic";

/**
 * A chat image, for the people in that conversation only.
 *
 * Staff with support access may open any; a customer only those attached to
 * the thread this browser is allowed to read (same rule as the messages
 * endpoint). Anything else - including a file nobody has attached yet - is a
 * plain 404, so names cannot be probed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const { name } = await params;
  const notFound = () => new Response("Not found", { status: 404 });
  if (!isChatFileName(name)) return notFound();

  const message = await prisma.ticketMessage.findFirst({
    where: { attachments: { has: name } },
    select: { ticketId: true },
  });
  if (!message) return notFound();

  const admin = await getApiAdmin();
  let allowed = Boolean(admin && can(admin.role, "support"));

  if (!allowed) {
    const jar = await cookies();
    const customer = await getCurrentCustomer();
    const access = await resolveThread({
      cookieId: jar.get(CHAT_COOKIE)?.value,
      customerId: customer?.id ?? null,
      customerEmail: customer?.email ?? null,
    });
    allowed = access.ok && access.ticketId === message.ticketId;
  }
  if (!allowed) return notFound();

  const buf = await readChatFile(name);
  if (!buf) return notFound();

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": mimeForChatFile(name),
      "Content-Length": String(buf.length),
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
