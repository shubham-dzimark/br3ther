import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAiConfig, providerKey, providerModel } from "@/lib/ai-agent";
import { richTextToPlain } from "@/lib/rich-text";

/**
 * Writing help for the admin's editor.
 *
 * Shares the assistant's provider and key, so a shop that has set up chat gets
 * this for nothing. Deliberately separate from the chat agent: there are no
 * tools here and nothing to look up - it takes text in and gives text back,
 * which is a much smaller thing to get wrong.
 */

const BASE_URL = "https://api.venice.ai/api/v1";

export type RewriteMode =
  | "improve"
  | "shorten"
  | "expand"
  | "fix"
  | "seoTitle"
  | "seoDescription";

const INSTRUCTIONS: Record<RewriteMode, string> = {
  improve:
    "Rewrite this product copy so it reads better: clearer, warmer, easier to skim. Keep every fact exactly as given.",
  shorten: "Make this product copy shorter and tighter. Keep every fact.",
  expand:
    "Expand this product copy a little with detail that is already implied. Invent no new facts - no materials, sizes, prices or claims that are not already there.",
  fix: "Fix the spelling, grammar and punctuation. Change nothing else - not the wording, not the tone, not the facts.",
  seoTitle:
    "Write a search-engine title for this. Between 50 and 60 characters - that is what Google shows before trimming. Lead with what the thing actually is, in the words a shopper would type. No quotes, no brand slogans, no ALL CAPS, no emoji.",
  seoDescription:
    "Write a meta description for this. Between 140 and 155 characters - longer is cut off mid-sentence in the results. One or two plain sentences saying what it is and why someone would want it. No quotes, no clickbait, no 'discover' or 'elevate'.",
};

const SYSTEM = [
  "You rewrite product descriptions for an online shop selling premium cigars, lighters and smoking accessories.",
  "",
  "Rules:",
  "- Return ONLY the rewritten text. No preamble, no explanation, no quotes around it, no markdown fences.",
  "- Never invent a fact. No materials, measurements, prices, delivery times, guarantees or certifications that were not in the original. A description that promises something the shop does not offer is worse than a clumsy one.",
  "- Keep roughly the same length unless asked to shorten or expand.",
  "- Plain sentences. No emoji, no exclamation marks, no 'elevate your wardrobe' filler.",
].join("\n");

export type RewriteResult = { ok: true; text: string } | { ok: false; error: string };

export async function rewrite(
  input: string,
  mode: RewriteMode,
): Promise<RewriteResult> {
  // The editor sends HTML; the model works on words and the editor puts the
  // formatting back, so nothing here can smuggle markup into the page.
  const text = richTextToPlain(input).slice(0, 4000);
  if (text.length < 10) {
    return { ok: false, error: "Select a bit more text first." };
  }

  const config = await getAiConfig();
  const key = providerKey(config);
  if (!key) {
    return {
      ok: false,
      error: "No API key set. Add one under Support → Chat Assistant.",
    };
  }

  const prompt = `${INSTRUCTIONS[mode]}\n\n---\n${text}\n---`;

  try {
    if (config.provider === "venice") {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: providerModel(config),
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: prompt },
          ],
          max_tokens: 1200,
          temperature: 0.4,
          venice_parameters: { include_venice_system_prompt: false },
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!res.ok) {
        const body = (await res.text()).slice(0, 160);
        return {
          ok: false,
          error:
            res.status === 401
              ? "The API key was rejected."
              : res.status === 402
                ? "That account is out of credit."
                : `The writing service returned ${res.status}. ${body}`,
        };
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const out = (data.choices?.[0]?.message?.content ?? "").trim();
      return out ? { ok: true, text: clean(out) } : { ok: false, error: "Nothing came back." };
    }

    const client = new Anthropic({ apiKey: key });
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, error: "The model declined to rewrite that." };
    }

    const out = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return out ? { ok: true, text: clean(out) } : { ok: false, error: "Nothing came back." };
  } catch (err) {
    console.error("[ai-write]", err);
    return { ok: false, error: err instanceof Error ? err.message : "Rewrite failed." };
  }
}

/** Models like to wrap answers in fences or quotes however firmly you ask. */
function clean(out: string): string {
  return out
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .replace(/^["'“”]|["'“”]$/g, "")
    .trim();
}
