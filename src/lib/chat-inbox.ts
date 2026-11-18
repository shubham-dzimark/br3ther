import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/prisma";
import { getMailConfig } from "@/lib/mail";
import { notifyAdmins } from "@/lib/notifications";
import { REPLY_MARKER, referenceFromSubject } from "@/lib/chat-email";
import { CHAT_FILE_MAX_COUNT, saveChatImage } from "@/lib/chat-files";

/**
 * Read customers' email replies back into their chat threads.
 *
 * Polls the shop's own mailbox over IMAP (same login as SMTP). Only unread
 * messages whose subject carries a chat reference are looked at, and only
 * those are ever marked read - the rest of the inbox belongs to people.
 *
 * A reply is accepted only from the address the thread is registered to.
 * Anything else (a forward, a stranger quoting the reference) is left unread
 * for a human to deal with.
 */

const MAX_BODY = 4000;

export type InboxResult = {
  ok: boolean;
  checked: number;
  added: number;
  skipped: number;
  error?: string;
};

/** Strip the quoted original, signatures' "sent from" lines and > quotes. */
export function extractReply(raw: string): string {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  const markerCore = REPLY_MARKER.replace(/#/g, "").trim().toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    const next = (lines[i + 1] ?? "").trim();
    if (t.toLowerCase().includes(markerCore)) break;
    if (/^on\s.+wrote:$/i.test(t)) break;
    if (/^on\s.+/i.test(t) && /wrote:$/i.test(next)) break; // wrapped over two lines
    if (/^-{2,}\s*original message/i.test(t)) break;
    if (/^_{6,}$/.test(t)) break; // Outlook separator
    if (/^from:\s.+/i.test(t) && /^(sent|date|to):/i.test(next)) break; // Outlook header block
    if (/^le\s.+a écrit\s?:$/i.test(t)) break; // French clients
    if (t.startsWith(">")) continue;
    kept.push(line);
  }

  return kept
    .join("\n")
    .replace(/^\s*sent from my .*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function imapHost(smtpHost: string): string {
  return process.env.IMAP_HOST?.trim() || smtpHost.replace(/^smtp\./i, "imap.");
}

export async function pollChatReplies(): Promise<InboxResult> {
  const result: InboxResult = { ok: true, checked: 0, added: 0, skipped: 0 };
  const config = await getMailConfig();
  if (!config.enabled || !config.user || !config.pass) {
    return { ...result, ok: false, error: "Email is not configured." };
  }

  const client = new ImapFlow({
    host: imapHost(config.host),
    port: Number.parseInt(process.env.IMAP_PORT ?? "993", 10) || 993,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });

  try {
    await client.connect();
  } catch (err) {
    return { ...result, ok: false, error: `IMAP login failed: ${err instanceof Error ? err.message : err}` };
  }

  const lock = await client.getMailboxLock("INBOX");
  try {
    const found = await client.search(
      { seen: false, subject: "[#CHAT-", since: new Date(Date.now() - 14 * 86_400_000) },
      { uid: true },
    );
    const uids = Array.isArray(found) ? found : [];

    for (const uid of uids) {
      result.checked++;
      // fetchOne does not set \Seen - the message stays unread unless we accept it.
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) {
        result.skipped++;
        continue;
      }
      const mail = await simpleParser(msg.source);

      const reference = referenceFromSubject(mail.subject ?? "");
      const from = mail.from?.value?.[0]?.address?.trim().toLowerCase();
      const auto = String(mail.headers.get("auto-submitted") ?? "no").toLowerCase();
      if (!reference || !from || auto !== "no") {
        result.skipped++;
        continue;
      }

      const ticket = await prisma.ticket.findUnique({
        where: { reference },
        select: { id: true, email: true, name: true, status: true },
      });
      if (!ticket || ticket.email?.trim().toLowerCase() !== from) {
        result.skipped++;
        continue;
      }

      const text = extractReply(mail.text ?? "").slice(0, MAX_BODY);

      // Pictures the customer attached. Inline ones (signature logos) are not theirs to send.
      const images: string[] = [];
      for (const att of mail.attachments ?? []) {
        if (images.length >= CHAT_FILE_MAX_COUNT) break;
        if (att.related || !/^image\/(png|jpe?g|gif|webp)$/i.test(att.contentType ?? "")) continue;
        const name = await saveChatImage(att.content);
        if (name) images.push(name);
      }

      if (text || images.length) {
        await prisma.$transaction([
          prisma.ticketMessage.create({
            data: { ticketId: ticket.id, body: text, fromStaff: false, attachments: images },
          }),
          // An emailed reply is a deliberate answer, so it reopens a closed thread.
          prisma.ticket.update({ where: { id: ticket.id }, data: { status: "OPEN" } }),
        ]);
        await notifyAdmins({
          type: "SUPPORT_MESSAGE",
          title: "Email reply to live chat",
          body: `${ticket.name ?? ticket.email}: ${text ? text.slice(0, 80) : "[image]"}`,
          href: "/admin/support/inbox",
        });
        result.added++;
      } else {
        result.skipped++;
      }

      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    }
  } catch (err) {
    result.ok = false;
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }

  return result;
}
