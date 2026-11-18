import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getMailConfig, sendMail } from "@/lib/mail";
import { escapeMailHtml, simpleEmail } from "@/lib/mail-templates";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { isCustomerOnline } from "@/lib/chat-presence";
import { mimeForChatFile, readChatFile } from "@/lib/chat-files";

/**
 * Live chat over email.
 *
 * When staff answer a customer who has left the site, the answer is emailed.
 * The customer can reply to that email (chat-inbox.ts reads the reply back
 * into the thread) or follow the link to carry on in the chat widget.
 *
 * The thread is identified by its reference in the subject - "[#CHAT-...]" -
 * which survives every mail client's "Re:" handling, unlike custom headers.
 */

/** Holds a signed thread id from an email link until the chat poll adopts it. */
export const CHAT_RESUME_COOKIE = "nl_chat_resume";
export const CLEAR_CHAT_RESUME = `${CHAT_RESUME_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** Everything below this line in a reply is the quoted original and is cut. */
export const REPLY_MARKER = "## Reply above this line ##";

const REF_IN_SUBJECT = /\[#(CHAT-[A-Z0-9]+)\]/i;

export function referenceFromSubject(subject: string): string | null {
  const m = REF_IN_SUBJECT.exec(subject);
  return m ? m[1].toUpperCase() : null;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
}

/*
 * The "continue the conversation" link is signed, so a thread id cannot be
 * guessed or swapped. It is not a login: an account-owned thread still needs
 * that account signed in (resolveThread enforces it), the link only says which
 * thread to open.
 */
function linkKey(): string {
  const base =
    process.env.CHAT_LINK_SECRET || process.env.CRON_SECRET || process.env.DATABASE_URL || "";
  return createHmac("sha256", "chat-resume-link:v1").update(base).digest("hex");
}

function sign(ticketId: string): string {
  return createHmac("sha256", linkKey()).update(ticketId).digest("base64url").slice(0, 32);
}

export function resumeToken(ticketId: string): string {
  return `${ticketId}.${sign(ticketId)}`;
}

/** The thread id the token was made for, or null if it was tampered with. */
export function verifyResumeToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const id = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(id));
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

export function resumeUrl(ticketId: string): string {
  return `${siteUrl()}/chat/resume?t=${encodeURIComponent(resumeToken(ticketId))}`;
}

/**
 * Email a staff reply to a customer who is no longer on the site.
 *
 * Never throws - it runs after the reply is saved, and a mail problem must not
 * turn a sent reply into an error for staff.
 */
export async function emailStaffReplyIfAway(
  ticketId: string,
  body: string,
  attachments: string[] = [],
): Promise<void> {
  try {
    if (isCustomerOnline(ticketId)) return;

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { reference: true, email: true, name: true },
    });
    if (!ticket?.email) return;

    const config = await getMailConfig();
    if (!config.enabled) return;

    const settings = await getSettings();
    const storeName = settings[SETTING_KEYS.storeName] || config.fromName || "Our team";
    const url = siteUrl();
    const link = resumeUrl(ticketId);
    const first = ticket.name?.trim().split(/\s+/)[0];

    // Replies must reach the mailbox the inbox poller reads - the SMTP login -
    // whatever general reply-to address the shop has set for order emails.
    const replyTo = config.user || config.fromEmail;
    const domain = (replyTo.split("@")[1] || "localhost").trim();

    const paragraphs = [
      `<span style="color:#9aa0a6;font-size:12px;">${escapeMailHtml(REPLY_MARKER)}</span>`,
      first ? `Hi ${escapeMailHtml(first)},` : "Hi,",
      ...body
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((para) => escapeMailHtml(para).replace(/\n/g, "<br>")),
      ...(attachments.length
        ? [`<em>${attachments.length === 1 ? "An image is" : `${attachments.length} images are`} attached to this email.</em>`]
        : []),
    ];

    const files = [];
    for (const name of attachments) {
      const content = await readChatFile(name);
      if (content) files.push({ filename: `image-${files.length + 1}.${name.split(".").pop()}`, content, contentType: mimeForChatFile(name) });
    }

    const result = await sendMail({
      to: ticket.email,
      subject: `Re: Your conversation with ${storeName} [#${ticket.reference}]`,
      html: simpleEmail({
        storeName,
        storeUrl: url,
        heading: "We replied to your message",
        preheader: body.slice(0, 100) || "We sent you an image",
        paragraphs,
        action: { href: link, label: "Continue the conversation" },
        note: `You can also just reply to this email - your answer goes straight into the chat. Reference ${escapeMailHtml(ticket.reference)}.`,
      }),
      text: [
        REPLY_MARKER,
        "",
        first ? `Hi ${first},` : "Hi,",
        "",
        body,
        "",
        `Continue the conversation: ${link}`,
        "",
        `Or just reply to this email - your answer goes straight into the chat. Reference ${ticket.reference}.`,
      ].join("\n"),
      ...(files.length ? { attachments: files } : {}),
      replyTo,
      messageId: `<chat.${ticket.reference}.${Date.now().toString(36)}@${domain}>`,
      headers: { "X-Chat-Reference": ticket.reference },
    });

    if (!result.ok) console.error(`[chat-email] ${ticket.reference}: ${result.error}`);
  } catch (err) {
    console.error("[chat-email] failed:", err instanceof Error ? err.message : err);
  }
}
