import "server-only";
import { prisma } from "@/lib/prisma";
import { lookupOrder, myOrders, searchStore, sendReset } from "@/lib/ai-tools";
import { getCatalogueRules, searchProducts, storeOffers } from "@/lib/ai-catalogue";

/**
 * The free chat assistant: a router, not a model.
 *
 * Everything customers actually ask for most - where is my parcel, I can't log
 * in, how long does shipping take - is deterministic. The tools already do the
 * real work; all that was ever needed on top was deciding which one to run and
 * writing a sentence around the answer. That does not need an LLM, and doing
 * it in code means no per-message cost, instant replies, and nothing that can
 * be talked out of its instructions.
 *
 * The rule it lives by: **when unsure, hand over.** A wrong answer from a shop
 * costs more than a short wait, so anything this does not clearly recognise
 * goes to a person rather than getting a guess.
 */

export type RouterResult = { reply: string | null; escalate: string | null };

/* ---------- Recognising what was asked ---------- */

/**
 * Checked before anything else. These are the conversations where a wrong or
 * even a slightly-off automated reply does real damage, so the router does not
 * attempt them at all.
 */
const ESCALATE_PATTERNS: [RegExp, string][] = [
  [/\b(refund|money back|chargeback|dispute)\b/i, "Refund request"],
  [/\b(cancel|change|amend|modify|update)\b.{0,20}\b(order|address|size)\b/i, "Wants to change or cancel an order"],
  [/\b(damaged|broken|faulty|defective|wrong item|missing item|never arrived|didn'?t arrive|lost)\b/i, "Problem with an order"],
  [/\b(complain|complaint|terrible|awful|disgusted|furious|angry|unacceptable|scam|fraud)\b/i, "Unhappy customer"],
  [/\b(lawyer|legal|sue|solicitor|ombudsman|consumer protection)\b/i, "Legal language used"],
  [/\b(discount|coupon|promo code|voucher|price match)\b/i, "Asking for a discount"],
  [/\b(wholesale|bulk order|partnership|collab|sponsor|influencer)\b/i, "Business enquiry"],
];

const HUMAN_PATTERNS = [
  /\b(human|real person|actual person|someone real|agent|representative|staff|manager|operator)\b/i,
  /\b(speak|talk|chat)\b.{0,15}\b(to|with)\b.{0,15}\b(someone|somebody|person|human|you)\b/i,
];

const ORDER_PATTERNS = [
  /\b(track|tracking|traking|trackin)\b/i,
  /\bwhere('?s| is)?\b.{0,25}\b(order|parcel|package|delivery|item|stuff|shipment)\b/i,
  /\border\b.{0,20}\b(status|update|arrive|arriving|coming|shipped|dispatch)\b/i,
  /\b(status|update)\b.{0,25}\border\b/i,
  /\border\b.{0,25}\b(status|update)\b/i,
  /\bhas\b.{0,15}\b(my|the)\b.{0,10}\b(order|parcel|package)\b.{0,15}\b(shipped|dispatched|sent|gone)\b/i,
  /\bwhen\b.{0,20}\b(will|do|does)\b.{0,20}\b(it|my order|my parcel|this)\b.{0,15}\b(arrive|come|get here|ship)\b/i,
];

const PASSWORD_PATTERNS = [
  /\b(password|passcode)\b/i,
  /\b(can'?t|cannot|unable to|trouble)\b.{0,20}\b(log|sign)\s?in\b/i,
  /\b(locked out|forgot my|reset my|forgotten my)\b/i,
];

const GREETING_ONLY = /^\s*(hi|hii+|hey+|hello|yo|good\s?(morning|afternoon|evening)|howdy)[\s!.,?]*$/i;
const THANKS_ONLY = /^\s*(thanks?|thank you|ty|cheers|great|perfect|ok|okay|got it|nice)[\s!.,?]*$/i;

/**
 * Order numbers here are plain zero-padded digits ("0001"), so a bare number
 * is ambiguous on its own - it could be a quantity or a postcode fragment.
 * Requiring the word "order" nearby, or an explicit hash, keeps it honest; a
 * wrong guess only ever produces "not found" because the email must match too.
 */
function findOrderNumber(text: string): string | null {
  const labelled =
    /\border\s*(?:number|no\.?|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{2,19})\b/i.exec(text) ??
    /#\s*([A-Z0-9][A-Z0-9-]{2,19})\b/i.exec(text);
  if (labelled) return labelled[1].replace(/^#/, "");

  // A message that is nothing but the number - the reply to "what's your
  // order number?". Anchored to the whole message, so it must be checked per
  // message rather than against the conversation joined together.
  const bare = /^\s*#?\s*([A-Z0-9][A-Z0-9-]{2,19})\s*$/i.exec(text.trim());
  return bare ? bare[1] : null;
}

function findEmail(text: string): string | null {
  const m = /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i.exec(text);
  return m ? m[1].toLowerCase() : null;
}

const matches = (text: string, patterns: RegExp[]) => patterns.some((p) => p.test(text));

/** First non-null result of `pick` across the messages, newest first. */
function firstMatch(
  bodies: string[],
  pick: (text: string) => string | null,
): string | null {
  for (const body of bodies) {
    const hit = pick(body);
    if (hit) return hit;
  }
  return null;
}

/* ---------- The router ---------- */

export async function routeMessage(ticketId: string): Promise<RouterResult> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      escalatedAt: true,
      status: true,
      customerId: true,
      messages: {
        orderBy: { createdAt: "asc" },
        take: 40,
        select: { body: true, fromStaff: true, fromAi: true },
      },
    },
  });
  if (!ticket || ticket.escalatedAt || ticket.status === "CLOSED") {
    return { reply: null, escalate: null };
  }
  // A person is already on it.
  if (ticket.messages.some((m) => m.fromStaff && !m.fromAi)) {
    return { reply: null, escalate: null };
  }

  const customerMessages = ticket.messages.filter((m) => !m.fromStaff && !m.fromAi);
  const latest = customerMessages[customerMessages.length - 1]?.body ?? "";
  if (!latest.trim()) return { reply: null, escalate: null };

  /*
   * Entities are gathered from the whole conversation, not just this message.
   * That is what lets "where's my order?" -> "0042" -> "jo@example.com" work
   * without the router holding any state of its own.
   */
  /*
   * Scanned message by message, newest first - NOT over the conversation
   * joined together.
   *
   * The bare-number pattern is anchored to a whole message ("0042" as a reply
   * to "what's the order number?"), and those anchors never matched inside a
   * joined blob. The effect was a customer answering the question and being
   * asked the very same question again.
   */
  const recentFirst = [...customerMessages].reverse().map((m) => m.body);
  const orderNumber = firstMatch(recentFirst, findOrderNumber);
  const email = firstMatch(recentFirst, findEmail);

  /*
   * Intent comes from the most recent message that expressed one, not from the
   * latest message alone.
   *
   * This is what makes a multi-turn exchange work. "Where is my order?" ->
   * "0042" -> "jo@example.com" is three messages, and only the first says what
   * the customer wants; reading intent from the last one saw a bare order
   * number, recognised nothing, and handed a perfectly answerable question to
   * a person.
   */
  let intent: "order" | "password" | null = null;
  for (let i = customerMessages.length - 1; i >= 0; i--) {
    const body = customerMessages[i].body;
    if (matches(body, ORDER_PATTERNS)) { intent = "order"; break; }
    if (matches(body, PASSWORD_PATTERNS)) { intent = "password"; break; }
  }

  // 1. Anything that must reach a person, before any automated reply.
  for (const [pattern, reason] of ESCALATE_PATTERNS) {
    if (pattern.test(latest)) return { reply: null, escalate: reason };
  }
  if (matches(latest, HUMAN_PATTERNS)) {
    return { reply: null, escalate: "Customer asked for a person." };
  }

  // 2. Small talk, so the first message is not met with silence.
  if (GREETING_ONLY.test(latest)) {
    return {
      reply:
        "Hi! I can check an order's status, help if you can't sign in, or answer questions about shipping and returns. What do you need?",
      escalate: null,
    };
  }
  if (THANKS_ONLY.test(latest)) {
    return { reply: "You're welcome. Anything else?", escalate: null };
  }

  // 3. Order status.
  if (intent === "order") {
    /*
     * Signed in: the session already proves who they are, so asking for an
     * email would be theatre. With no order number we simply show them all of
     * theirs, which is usually what "where's my order?" means anyway.
     */
    if (ticket.customerId) {
      const result = orderNumber
        ? await lookupOrder({ orderNumber }, ticket.id, ticket.customerId)
        : await myOrders(ticket.id, ticket.customerId);
      const listing = !orderNumber;

      if (result.outcome === "ok") {
        return {
          reply: listing
            ? `Here are your recent orders:\n\n${result.text}`
            : `Here's where it is:\n\n${result.text}`,
          escalate: null,
        };
      }
      if (result.outcome === "not_found") return { reply: result.text, escalate: null };
      return { reply: null, escalate: "Could not look up the order." };
    }

    if (!orderNumber && !email) {
      return {
        reply:
          "I can look that up. What's your order number, and the email address you used at checkout?",
        escalate: null,
      };
    }
    if (!orderNumber) {
      return { reply: "Thanks. What's the order number?", escalate: null };
    }
    if (!email) {
      return {
        reply:
          "Thanks. And the email address you used at checkout? I need both to pull up an order.",
        escalate: null,
      };
    }

    const result = await lookupOrder({ orderNumber, email }, ticket.id);
    if (result.outcome === "ok") {
      return { reply: `Here's where it is:\n\n${result.text}`, escalate: null };
    }
    if (result.outcome === "not_found") {
      /*
       * Deliberately not retried in a loop. Two failed attempts almost always
       * means something a person needs to untangle, and asking a third time is
       * how a chat bot earns its reputation.
       */
      const attempts = ticket.messages.filter(
        (m) => m.fromAi && m.body.includes("couldn't find"),
      ).length;
      if (attempts >= 1) {
        return { reply: null, escalate: "Order lookup failed twice - needs a person." };
      }
      return { reply: result.text, escalate: null };
    }
    return { reply: null, escalate: "Could not look up the order." };
  }

  // 4. Password / sign-in trouble.
  if (intent === "password") {
    // Signed in: use the account's own address, never one typed into chat.
    if (ticket.customerId) {
      const account = await prisma.customer.findUnique({
        where: { id: ticket.customerId },
        select: { email: true },
      });
      if (account) {
        const sent = await sendReset({ email: account.email }, ticket.id);
        return sent.outcome === "ok"
          ? {
              reply: `Sent a reset link to ${account.email}. It works once and expires in an hour — check your spam folder if it doesn't arrive in a few minutes.`,
              escalate: null,
            }
          : { reply: null, escalate: "Password reset could not be sent." };
      }
    }

    if (!email) {
      return {
        reply:
          "I can send you a reset link. What's the email address on the account?",
        escalate: null,
      };
    }
    const result = await sendReset({ email }, ticket.id);
    return result.outcome === "ok"
      ? {
          reply:
            "Sent. If that address has an account, a reset link is on its way - it works once and expires in an hour. Check your spam folder if it doesn't arrive in a few minutes.",
          escalate: null,
        }
      : { reply: null, escalate: "Password reset could not be sent." };
  }

  // 5. Sales and discounts.
  if (/\b(sale|discount|offer|deal|promo|coupon|free shipping|cheaper|clearance)\b/i.test(latest)) {
    const rules = await getCatalogueRules();
    const offers = await storeOffers(rules);
    if (offers.outcome === "ok") {
      return { reply: `Here's what's on at the moment:\n\n${offers.text}`, escalate: null };
    }
    return { reply: "There are no offers running right now.", escalate: null };
  }

  // 6. Products - the catalogue, before the policy pages.
  const rules = await getCatalogueRules();
  const hits = await searchProducts({ query: latest }, rules);
  if (hits.outcome === "ok") {
    // Only the first match; a chat window is no place for a results page.
    const first = hits.text.split("\n\n")[0];
    return {
      reply: `${first}\n\nWant anything else about it?`,
      escalate: null,
    };
  }

  // 7. Anything else: answer only if the shop has written it down.
  const found = await searchStore({ query: searchTerms(latest) }, ticket.id);
  if (found.outcome === "ok") {
    const answer = summarise(found.text);
    if (answer) {
      return {
        reply: `${answer}\n\nIf that doesn't cover it, say so and I'll get a person.`,
        escalate: null,
      };
    }
  }

  // 8. Not recognised. Hand over rather than guess.
  return {
    reply: null,
    escalate: `Assistant could not answer: "${latest.slice(0, 120)}"`,
  };
}

/** Strip filler so the search hits the words that carry meaning. */
function searchTerms(text: string): string {
  const stop = new Set([
    "the","a","an","is","are","do","does","did","can","could","would","will","i","my","me","you","your",
    "what","whats","how","when","where","why","to","for","of","on","in","it","this","that","have","has",
    "please","hi","hello","hey","thanks","thank","and","or","but","with","about","get","got","been","be",
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  return words.slice(0, 6).join(" ");
}

/**
 * Turn a search hit into something a chat window can show.
 *
 * Quotes the shop's own words rather than paraphrasing - without a model there
 * is nothing that can safely reword a returns policy, and a mangled policy is
 * worse than a link.
 */
function summarise(raw: string): string | null {
  const first = raw.split("\n---\n")[0] ?? "";
  const body = first.replace(/^(PAGE|PRODUCT)\s+"[^"]*"\s*\([^)]*\)[^:]*:\s*/i, "").trim();
  if (body.length < 40) return null;

  // Two sentences is about what fits a chat bubble without scrolling.
  const sentences = body.match(/[^.!?]+[.!?]+/g) ?? [body];
  const answer = sentences.slice(0, 2).join(" ").trim();
  return answer.length > 400 ? `${answer.slice(0, 397)}...` : answer;
}
