import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import {
  getAiConfig,
  providerKey,
  providerModel,
  runTool,
  systemPrompt,
  toolDefs,
  type AgentReply,
  type AiConfig,
} from "@/lib/ai-agent";

/**
 * Venice.ai - an OpenAI-compatible aggregator.
 *
 * Written against `fetch` rather than an SDK: the surface used here is one
 * POST, and pulling in the OpenAI client to talk to a non-OpenAI service buys
 * nothing but a dependency.
 *
 * The system prompt and the tools are imported from the Claude path rather
 * than copied. That matters more than it looks: the tools are what keep
 * customer data safe, and two hand-maintained copies of a security boundary
 * drift apart the first time only one of them is edited.
 */

const BASE_URL = "https://api.venice.ai/api/v1";

/** Anthropic tool shape -> OpenAI function shape. Same schema, different envelope. */
function veniceTools(config: AiConfig, signedIn: boolean) {
  return toolDefs(config, signedIn).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

type VeniceMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

export async function replyToThreadVenice(ticketId: string): Promise<AgentReply> {
  const config = await getAiConfig();
  const key = providerKey(config);
  if (!key) return { reply: null, escalate: null };

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
  if (ticket.messages.some((m) => m.fromStaff && !m.fromAi)) {
    return { reply: null, escalate: null };
  }

  const aiSoFar = ticket.messages.filter((m) => m.fromAi).length;
  if (aiSoFar >= config.maxRepliesPerThread) {
    return { reply: null, escalate: "Assistant reached its reply limit for this conversation." };
  }
  if (config.dailyCap > 0) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = await prisma.ticketMessage.count({
      where: { fromAi: true, createdAt: { gte: since } },
    });
    if (today >= config.dailyCap) {
      return { reply: null, escalate: "Assistant hit today's message cap." };
    }
  }

  const settings = await getSettings();
  const storeName = settings[SETTING_KEYS.storeName] || "Br3thr";

  const messages: VeniceMessage[] = [
    { role: "system", content: systemPrompt(config, storeName, Boolean(ticket.customerId)) },
    ...ticket.messages.map((m) => ({
      role: (m.fromStaff || m.fromAi ? "assistant" : "user") as "assistant" | "user",
      content: m.body,
    })),
  ];

  let escalate: string | null = null;

  try {
    // Bounded: a support answer needs a lookup or two, and an unbounded loop
    // behind a public chat box is a way to spend money on request.
    for (let turn = 0; turn < 5; turn++) {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: providerModel(config),
          messages,
          tools: veniceTools(config, Boolean(ticket.customerId)),
          tool_choice: "auto",
          max_tokens: 1000,
          temperature: 0.3,
          /*
           * Venice-specific: keep the shop's own system prompt as the whole
           * instruction set. Without this Venice prepends its own, which would
           * quietly compete with the rules that keep the assistant in scope.
           */
          venice_parameters: { include_venice_system_prompt: false },
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        console.error(`[venice] ${res.status}: ${detail}`);
        return {
          reply: null,
          escalate: "The assistant hit an error.",
          error: `${res.status}: ${detail}`,
        };
      }

      const data = (await res.json()) as {
        choices?: { message?: VeniceMessage; finish_reason?: string }[];
      };
      const message = data.choices?.[0]?.message;
      if (!message) return { reply: null, escalate: "The assistant returned nothing." };

      const calls = message.tool_calls ?? [];
      if (calls.length === 0) {
        const text = (message.content ?? "").trim();
        return { reply: text || null, escalate };
      }

      // The assistant turn must be echoed back before its tool results.
      messages.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: calls,
      });

      for (const call of calls) {
        /*
         * Arguments arrive as a JSON string and are parsed, never string
         * matched - models vary in how they escape, and a regex over the raw
         * text is how an order number quietly becomes the wrong one.
         */
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }

        const out = await runTool(call.function.name, args, ticket.id, config, ticket.customerId);
        if ("escalate" in out && out.escalate) escalate = out.escalate;

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: out.text,
        });
      }
    }

    return { reply: null, escalate: "Assistant could not resolve this in a few steps." };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[venice] reply failed:", error);
    return { reply: null, escalate: "The assistant hit an error.", error };
  }
}

/** Used by the admin "Test connection" button. */
export async function testVenice(
  key: string,
  model: string,
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Reply with exactly: connection ok" },
          { role: "user", content: "test" },
        ],
        max_tokens: 20,
        venice_parameters: { include_venice_system_prompt: false },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      return {
        ok: false,
        error:
          res.status === 401
            ? "Venice rejected that API key."
            : res.status === 402
              ? "Venice says this account has no credit."
              : `Venice returned ${res.status}: ${body}`,
      };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { ok: true, reply: (data.choices?.[0]?.message?.content ?? "").trim() || "(empty)" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
