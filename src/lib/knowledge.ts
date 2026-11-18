import "server-only";
import { prisma } from "@/lib/prisma";
import { richTextToPlain } from "@/lib/rich-text";

/*
 * The shop's own answers, and the record of what it could not answer.
 *
 * Retrieval is scored rather than a substring match. `contains` could not tell
 * "do you ship to the US" from a policy page that happens to contain the word
 * "ship", and it missed anything phrased differently - which is why the
 * assistant so often had nothing to say.
 */

/** Words that carry no signal in a customer question. */
const FILLER = new Set([
  "the", "and", "for", "you", "your", "yours", "are", "was", "have", "has",
  "had", "can", "could", "would", "will", "does", "did", "doing", "any", "all",
  "some", "this", "that", "these", "those", "with", "from", "about", "into",
  "our", "their", "its", "not", "but", "get", "got", "please", "hello", "tell",
  "know", "show", "see", "find", "there", "here", "what", "when", "where",
  "which", "how", "why", "who", "them", "they", "his", "her", "him", "she",
  "also", "just", "like", "more", "most", "many", "much", "yes", "does", "may",
  "i", "me", "my", "we", "us", "a", "an", "is", "it", "of", "on", "to", "in",
  "do", "if", "or", "be", "am", "at", "so",
]);

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length > 1 && !FILLER.has(w));
}

/** Collapses "Do you ship to the US?" and "do you ship to the us" into one. */
export function fingerprint(question: string): string {
  return tokenise(question).sort().join(" ").slice(0, 300) || question.trim().toLowerCase().slice(0, 300);
}

/**
 * Crude suffix stripping, applied to both sides of the comparison.
 *
 * Without it "how long until my parcel arrives" missed an article whose
 * keywords said "arrive", and "do you take credit cards" missed one that said
 * "credit card". A real stemmer would be overkill for a few hundred short
 * rows; matching singular to plural is where nearly all of the loss was.
 */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  return w;
}

const stems = (text: string) => new Set(tokenise(text).map(stem));

export type KnowledgeHit = {
  id: string;
  question: string;
  answer: string;
  score: number;
};

/**
 * Score one article against the question's terms.
 *
 * The article's own question is weighted far above its answer: an answer that
 * happens to mention "shipping" is much weaker evidence than a question that
 * is *about* shipping. The coverage multiplier then rewards matching more of
 * what was actually asked, so a single coincidental word loses to an article
 * that matches most of the sentence.
 */
function score(
  asked: string[],
  question: Set<string>,
  keywords: Set<string>,
  answer: Set<string>,
): number {
  let total = 0;
  let matched = 0;

  for (const t of asked) {
    if (question.has(t)) {
      total += 10;
      matched++;
    } else if (keywords.has(t)) {
      // Nearly as strong as the question itself: a keyword is a deliberate
      // signal someone typed in, not an accident of phrasing.
      total += 9;
      matched++;
    } else if (answer.has(t)) {
      total += 2;
      matched++;
    }
  }

  /*
   * Coverage rewards matching more of the sentence, but only mildly. A harsh
   * penalty punished the shortest, clearest questions - "how much is postage"
   * reduces to a single meaningful word, and there is nothing weak about it.
   */
  const coverage = asked.length ? matched / asked.length : 0;
  return total * (0.65 + 0.35 * coverage);
}

/**
 * Below this, a "match" is a coincidence. Answering anyway is how an
 * assistant ends up confidently telling someone the wrong return window.
 */
export const CONFIDENCE_FLOOR = 8;

export async function searchKnowledge(
  query: string,
  limit = 3,
): Promise<KnowledgeHit[]> {
  const asked = tokenise(query).map(stem);
  if (asked.length === 0) return [];

  // Small table, read whole and scored in memory: a few hundred short rows is
  // far cheaper than trying to express this ranking in SQL.
  const rows = await prisma.knowledgeArticle.findMany({
    where: { isActive: true },
    select: { id: true, question: true, answer: true, keywords: true },
  });

  return rows
    .map((r) => {
      const plain = richTextToPlain(r.answer);
      return {
        id: r.id,
        question: r.question,
        answer: plain,
        score: score(asked, stems(r.question), stems(r.keywords), stems(plain)),
      };
    })
    .filter((r) => r.score >= CONFIDENCE_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Counts a use, so staff can see which articles earn their place. */
export async function recordKnowledgeUse(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await prisma.knowledgeArticle.updateMany({
      where: { id: { in: ids } },
      data: { useCount: { increment: 1 } },
    });
  } catch {
    // Never let bookkeeping break an answer.
  }
}

/**
 * Record a question nothing could answer.
 *
 * Deduplicated by fingerprint and counted, so the admin list reads "asked 14
 * times" instead of showing fourteen rows of the same thing - which is what
 * tells staff which gap to fill first.
 */
export async function recordGap(
  question: string,
  ticketId: string | null,
): Promise<void> {
  const text = question.trim().slice(0, 500);
  if (text.length < 3) return;

  try {
    const fp = fingerprint(text);
    await prisma.unansweredQuestion.upsert({
      where: { fingerprint: fp },
      create: { fingerprint: fp, question: text, ticketId },
      update: { askedCount: { increment: 1 }, lastAskedAt: new Date() },
    });
  } catch {
    // Same rule: bookkeeping must never break the reply.
  }
}

export type FaqGroup = {
  category: string;
  slug: string;
  items: { id: string; question: string; answer: string }[];
};

/**
 * The published knowledge base, grouped for the FAQ page.
 *
 * The same rows the assistant answers from, so the page and the chat can never
 * drift apart - one edit updates both. Answers are already sanitised on save;
 * they are stored as HTML and rendered as such.
 */
export async function getPublicFaq(): Promise<FaqGroup[]> {
  const rows = await prisma.knowledgeArticle.findMany({
    where: { isActive: true },
    orderBy: [{ useCount: "desc" }, { question: "asc" }],
    select: { id: true, question: true, answer: true, category: true },
  });

  const groups = new Map<string, FaqGroup>();
  for (const r of rows) {
    const category = r.category?.trim() || "General";
    const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const group = groups.get(category) ?? { category, slug, items: [] };
    group.items.push({ id: r.id, question: r.question, answer: r.answer });
    groups.set(category, group);
  }

  // "General" last: it is the catch-all, so it reads as the tail of the page
  // rather than the headline.
  return [...groups.values()].sort((a, b) => {
    if (a.category === "General") return 1;
    if (b.category === "General") return -1;
    return a.category.localeCompare(b.category);
  });
}
