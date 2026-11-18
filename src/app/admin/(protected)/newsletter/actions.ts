"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { can, landingFor, requireCapability } from "@/lib/permissions";
import { sanitizeRichText } from "@/lib/rich-text";
import { saveDraft, sendTest, startSend, type NewsletterDraft } from "@/lib/newsletter";

const text = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim();

/*
 * Promotions owns marketing, and the addresses are customer contact details,
 * so both are needed - the same pairing the guest invites use.
 */
async function guard() {
  const me = await requireCapability("promotions");
  if (!can(me.role, "customer_pii")) {
    const to = landingFor(me.role);
    redirect(`${to}${to.includes("?") ? "&" : "?"}denied=customer_pii`);
  }
  return me;
}

/** Back to the screen, keeping a single-recipient selection if there was one. */
function back(fd: FormData, params: Record<string, string | number>): never {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const to = text(fd, "to");
  if (to) q.set("to", to);
  redirect(`/admin/newsletter?${q.toString()}#compose`);
}

function readDraft(fd: FormData): NewsletterDraft {
  const buttonUrl = text(fd, "buttonUrl");
  return {
    subject: text(fd, "subject").slice(0, 200),
    heading: text(fd, "heading").slice(0, 200),
    preheader: text(fd, "preheader").slice(0, 200),
    // Editor output, allowlisted server-side - never trust the client.
    bodyHtml: sanitizeRichText(String(fd.get("body") ?? "")),
    buttonLabel: text(fd, "buttonLabel").slice(0, 60),
    // Only web links: anything else in a button is either broken or hostile.
    buttonUrl: /^https?:\/\//i.test(buttonUrl) ? buttonUrl.slice(0, 500) : "",
  };
}

/** Saves the draft and refuses to go on without a subject and a message. */
async function savedDraft(fd: FormData): Promise<NewsletterDraft> {
  const draft = readDraft(fd);
  await saveDraft(draft);
  if (!draft.subject || !draft.bodyHtml) back(fd, { error: "incomplete" });
  return draft;
}

export async function saveNewsletterDraft(fd: FormData): Promise<void> {
  await guard();
  await saveDraft(readDraft(fd));
  back(fd, { saved: "draft" });
}

export async function sendNewsletterTest(fd: FormData): Promise<void> {
  const me = await guard();
  const draft = await savedDraft(fd);
  const result = await sendTest(draft, me.email);
  if (result.ok) back(fd, { test: "ok" });
  back(fd, { error: "test", detail: result.error.slice(0, 160) });
}

export async function sendNewsletter(fd: FormData): Promise<void> {
  const me = await guard();
  const draft = await savedDraft(fd);

  // One person picked with "Email" wins over anything ticked in the list.
  const single = text(fd, "to");
  const ids = single
    ? [single]
    : text(fd, "mode") === "selected"
      ? [...new Set(fd.getAll("ids").map((v) => String(v).trim()).filter(Boolean))]
      : null;
  if (ids && ids.length === 0) back(fd, { error: "none_selected" });

  const outcome = await startSend(draft, ids, me.email);
  switch (outcome.status) {
    case "started":
      // The selection is done with once the send has started.
      redirect(`/admin/newsletter?sent=started&n=${outcome.total}&u=${outcome.unsubscribed}`);
    case "busy":
      back(fd, { error: "busy" });
    case "empty":
      back(fd, { error: "empty", u: outcome.unsubscribed });
    case "mail_off":
      back(fd, { error: `mail_${outcome.reason}` });
  }
}

/** Removes the ticked signups from the list. Unsubscribes stay recorded. */
export async function deleteSubscribers(fd: FormData): Promise<void> {
  await guard();
  const ids = [...new Set(fd.getAll("ids").map((v) => String(v).trim()).filter(Boolean))];
  if (ids.length === 0) redirect("/admin/newsletter");

  const { count } = await prisma.newsletterSubscriber.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/admin/newsletter");
  redirect(`/admin/newsletter?deleted=${count}`);
}
