import "server-only";
import { prisma } from "@/lib/prisma";
import { getMailConfig, missingMailFields, sendMail, type MailConfig } from "@/lib/mail";
import { newsletterEmail } from "@/lib/mail-templates";
import { getSettings, setSetting, SETTING_KEYS } from "@/lib/settings";
import { unsubscribeToken } from "@/lib/abandoned-cart";

/*
 * Emails written by staff to newsletter signups, from the Newsletter screen.
 *
 * A send runs in the background after the action has answered: one message at
 * a time per worker over SMTP takes far longer than a request may stay open
 * once the list grows. Its progress is kept in a store setting so the screen
 * can show it, and so a second send cannot start while one is running.
 *
 * These are marketing emails, so every one carries the same signed unsubscribe
 * link as cart reminders, and unsubscribed addresses are skipped.
 */

const DRAFT_KEY = "newsletter.draft";
const JOB_KEY = "newsletter.lastSend";
const CONCURRENCY = 4;
/** A send that has not reported for this long is treated as dead, not running. */
const STALE_MS = 30 * 60_000;

export type NewsletterDraft = {
  subject: string;
  heading: string;
  preheader: string;
  bodyHtml: string;
  buttonLabel: string;
  buttonUrl: string;
};

export const EMPTY_DRAFT: NewsletterDraft = {
  subject: "",
  heading: "",
  preheader: "",
  bodyHtml: "",
  buttonLabel: "",
  buttonUrl: "",
};

export type NewsletterJob = {
  status: "running" | "done";
  subject: string;
  total: number;
  sent: number;
  failed: { email: string; error: string }[];
  /** Addresses left out because they unsubscribed. */
  unsubscribed: number;
  by: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
};

async function readJson<T>(key: string): Promise<T | null> {
  // Straight from the table: getSettings is cached per request, and a send's
  // progress changes underneath it.
  const row = await prisma.storeSetting.findUnique({ where: { key } });
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function getDraft(): Promise<NewsletterDraft> {
  return { ...EMPTY_DRAFT, ...(await readJson<Partial<NewsletterDraft>>(DRAFT_KEY)) };
}

export async function saveDraft(draft: NewsletterDraft): Promise<void> {
  await setSetting(DRAFT_KEY, JSON.stringify(draft));
}

export async function getJob(): Promise<NewsletterJob | null> {
  return readJson<NewsletterJob>(JOB_KEY);
}

export function isRunning(job: NewsletterJob | null): boolean {
  return Boolean(
    job && job.status === "running" && Date.now() - Date.parse(job.updatedAt) < STALE_MS,
  );
}

async function writeJob(job: NewsletterJob): Promise<void> {
  await setSetting(JOB_KEY, JSON.stringify({ ...job, updatedAt: new Date().toISOString() }));
}

/** Plain-text part: the HTML body with its links written out. */
function htmlToText(html: string): string {
  return html
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      return text && text !== href ? `${text} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/(p|h[1-6]|li|div|tr|blockquote|figure)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Context = { storeName: string; siteUrl: string };

async function context(): Promise<Context> {
  return {
    storeName: (await getSettings())[SETTING_KEYS.storeName] || "Br3thr",
    siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://br3thr.com").replace(/\/$/, ""),
  };
}

async function buildMail(draft: NewsletterDraft, email: string, ctx: Context) {
  const unsubscribeUrl = `${ctx.siteUrl}/unsubscribe?email=${encodeURIComponent(email)}&t=${await unsubscribeToken(email)}`;
  const action =
    draft.buttonLabel && draft.buttonUrl
      ? { href: draft.buttonUrl, label: draft.buttonLabel }
      : undefined;
  return {
    to: email,
    subject: draft.subject,
    html: newsletterEmail({
      storeName: ctx.storeName,
      storeUrl: ctx.siteUrl,
      heading: draft.heading || draft.subject,
      preheader: draft.preheader || draft.subject,
      bodyHtml: draft.bodyHtml,
      action,
      unsubscribeUrl,
    }),
    text: [
      draft.heading || draft.subject,
      htmlToText(draft.bodyHtml),
      action ? `${action.label}: ${action.href}` : "",
      `Unsubscribe: ${unsubscribeUrl}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

type MailCheck = { ok: true; mail: MailConfig } | { ok: false; reason: "disabled" | "incomplete" };

async function mailReady(): Promise<MailCheck> {
  const mail = await getMailConfig();
  if (!mail.enabled) return { ok: false, reason: "disabled" };
  if (missingMailFields(mail).length) return { ok: false, reason: "incomplete" };
  return { ok: true, mail };
}

/** One copy to a staff address, so the email can be checked before it goes out. */
export async function sendTest(
  draft: NewsletterDraft,
  to: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ready = await mailReady();
  if (!ready.ok) return { ok: false, error: `mail_${ready.reason}` };
  const result = await sendMail(
    { ...(await buildMail(draft, to, await context())), subject: `[Test] ${draft.subject}` },
    ready.mail,
  );
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export type StartOutcome =
  | { status: "started"; total: number; unsubscribed: number }
  | { status: "busy" }
  | { status: "empty"; unsubscribed: number }
  | { status: "mail_off"; reason: "disabled" | "incomplete" };

/**
 * Starts a send to the given subscribers (every subscriber when `ids` is
 * null). Returns once the job is recorded; the emails go out afterwards.
 */
export async function startSend(
  draft: NewsletterDraft,
  ids: string[] | null,
  by: string,
): Promise<StartOutcome> {
  if (isRunning(await getJob())) return { status: "busy" };
  const ready = await mailReady();
  if (!ready.ok) return { status: "mail_off", reason: ready.reason };

  const subscribers = await prisma.newsletterSubscriber.findMany({
    where: ids ? { id: { in: ids } } : {},
    select: { email: true },
  });
  const emails = [...new Set(subscribers.map((s) => s.email.trim().toLowerCase()))];
  const suppressed = new Set(
    emails.length
      ? (
          await prisma.emailSuppression.findMany({
            where: { email: { in: emails } },
            select: { email: true },
          })
        ).map((s) => s.email)
      : [],
  );
  const queue = emails.filter((e) => !suppressed.has(e));
  if (queue.length === 0) return { status: "empty", unsubscribed: suppressed.size };

  const now = new Date().toISOString();
  const job: NewsletterJob = {
    status: "running",
    subject: draft.subject,
    total: queue.length,
    sent: 0,
    failed: [],
    unsubscribed: suppressed.size,
    by,
    startedAt: now,
    updatedAt: now,
  };
  await writeJob(job);

  // Fire and forget, like queueMail: the action answers now and the screen
  // reads progress from the job record.
  void run(job, queue, draft, ready.mail).catch(async (err) => {
    console.error(`[newsletter] send stopped: ${err instanceof Error ? err.message : String(err)}`);
    await writeJob({ ...job, status: "done", finishedAt: new Date().toISOString() });
  });

  return { status: "started", total: queue.length, unsubscribed: suppressed.size };
}

async function run(
  job: NewsletterJob,
  queue: string[],
  draft: NewsletterDraft,
  mail: MailConfig,
): Promise<void> {
  const ctx = await context();
  let sinceWrite = 0;

  const worker = async () => {
    for (let email = queue.shift(); email; email = queue.shift()) {
      const result = await sendMail(await buildMail(draft, email, ctx), mail);
      if (result.ok) job.sent += 1;
      else job.failed.push({ email, error: result.error.slice(0, 200) });
      if (++sinceWrite >= 10) {
        sinceWrite = 0;
        await writeJob(job);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  job.status = "done";
  job.finishedAt = new Date().toISOString();
  await writeJob(job);
}
