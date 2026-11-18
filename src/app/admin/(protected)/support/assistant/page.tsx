import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getAiConfig, aiReady, assistantReady } from "@/lib/ai-agent";
import { getCatalogueRules } from "@/lib/ai-catalogue";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { SectionCard, Field, fieldInput, fieldTextarea, fieldSelect } from "@/components/admin/Field";
import { btnPrimary, btnGhost, thCls, tdCls } from "@/components/admin/ui";
import { saveAssistantSettings, testVeniceConnection } from "./actions";
import { getTimeZone, tzLabel } from "@/lib/timezone";

export const metadata: Metadata = { title: "Chat assistant" };
export const dynamic = "force-dynamic";

/*
 * Only models Venice reports as supporting tool calling, with their live
 * prices per million tokens. A model without tool calling would chat happily
 * and never look up an order, which is the failure that looks like it works.
 */
const VENICE_MODELS = [
  { id: "zai-org-glm-4.7-flash", label: "GLM 4.7 Flash — cheapest ($0.06 / $0.40 per M)" },
  { id: "qwen3-5-9b", label: "Qwen3 9B — very cheap ($0.10 / $0.15)" },
  { id: "mistral-small-3-2-24b-instruct", label: "Mistral Small 24B ($0.09 / $0.25)" },
  { id: "google-gemma-3-27b-it", label: "Gemma 3 27B ($0.12 / $0.20)" },
  { id: "qwen3-235b-a22b-instruct-2507", label: "Qwen3 235B — stronger ($0.15 / $0.75)" },
  { id: "deepseek-v3.2", label: "DeepSeek v3.2 ($0.33 / $0.48)" },
  { id: "zai-org-glm-4.7", label: "GLM 4.7 ($0.55 / $2.65)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 via Venice ($3 / $15)" },
];

const OUTCOME_TONE: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  denied: "bg-amber-50 text-amber-700",
  not_found: "bg-slate-100 text-slate-600",
  error: "bg-red-50 text-red-700",
};

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; detail?: string }>;
}) {
  const me = await requireCapability("support");
  const tz = await getTimeZone();
  const [sp, config, rules, s, calls, stats] = await Promise.all([
    searchParams,
    getAiConfig(),
    getCatalogueRules(),
    getSettings(),
    prisma.aiToolCall.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.ticketMessage.count({
      where: { fromAi: true, createdAt: { gte: new Date(Date.now() - 86400000) } },
    }),
  ]);

  const isOwner = me.role === "OWNER";
  const keyFromEnv = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const hasStoredKey = Boolean(s[SETTING_KEYS.aiApiKey]);
  const veniceKeyFromEnv = Boolean(process.env.VENICE_API_KEY?.trim());
  const hasVeniceKey = Boolean(s[SETTING_KEYS.aiVeniceKey]);
  const escalated = await prisma.ticket.count({ where: { escalatedAt: { not: null } } });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Chat assistant
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Answers the easy questions in live chat — shipping, returns, order
          tracking, password resets — and hands everything else to you.
        </p>
      </div>

      {sp.saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {sp.saved === "tested"
            ? `Venice replied: "${sp.detail ? decodeURIComponent(sp.detail) : ""}" — the key and model work.`
            : "Saved."}
        </p>
      ) : null}
      {sp.error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {sp.error === "forbidden"
            ? "Only a Master can change these settings."
            : sp.error === "nokey"
              ? "Enter a Venice API key first."
              : sp.detail
                ? decodeURIComponent(sp.detail)
                : "Something went wrong."}
        </p>
      ) : null}

      <div
        className={`rounded-2xl border px-4 py-3.5 text-sm ${
          assistantReady(config)
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        {config.mode === "rules" ? (
          <>
            <strong className="font-semibold">On — free mode.</strong> Answering
            tracking, sign-in and FAQ questions from your own pages. No API key,
            no per-message cost. {stats} assistant
            {stats === 1 ? " reply" : " replies"} in the last 24 hours;{" "}
            {escalated} conversation{escalated === 1 ? "" : "s"} handed to a person.
          </>
        ) : aiReady(config) ? (
          <>
            <strong className="font-semibold">On — AI mode.</strong> Answering
            with {config.provider === "venice" ? `${config.veniceModel} (Venice)` : config.model}
            {config.offlineOnly ? ", outside staff hours only" : ""}. {stats} assistant
            {stats === 1 ? " reply" : " replies"} in the last 24 hours;{" "}
            {escalated} conversation{escalated === 1 ? "" : "s"} handed to a person.
          </>
        ) : config.mode === "ai" ? (
          <>
            <strong className="font-semibold">AI mode needs an API key.</strong>{" "}
            Nothing is answering. Add a key below, or switch to free mode.
          </>
        ) : (
          <>
            <strong className="font-semibold">Off.</strong> Every chat goes
            straight to you, as it does today.
          </>
        )}
      </div>

      {isOwner ? (
        <form action={saveAssistantSettings} className="space-y-5">
          <SectionCard title="Turn it on">
            <div className="space-y-3">
              {[
                {
                  value: "off",
                  title: "Off",
                  note: "Every chat goes straight to you, as it does now.",
                },
                {
                  value: "rules",
                  title: "Free mode — no API key, no cost",
                  note: "Recognises tracking, sign-in and FAQ questions and answers them from your own pages. Anything it doesn't clearly recognise goes to a person rather than getting a guess.",
                },
                {
                  value: "ai",
                  title: "AI mode — needs a paid API key",
                  note: "Claude reads the question instead of matching phrasing, so it handles wording free mode misses. Costs roughly $6 per 1,000 conversations on Haiku.",
                },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5"
                >
                  <input
                    type="radio"
                    name="mode"
                    value={opt.value}
                    defaultChecked={config.mode === opt.value}
                    className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
                  />
                  <span className="text-sm text-slate-700">
                    {opt.title}
                    <span className="mt-0.5 block text-xs text-slate-500">{opt.note}</span>
                  </span>
                </label>
              ))}
              <p className="px-1 text-xs text-slate-500">
                In either mode replies are labelled &ldquo;Assistant · AI&rdquo;
                in the chat window, and a &ldquo;Talk to a real person&rdquo; button
                sits under every conversation it touches.
              </p>
            </div>

            <label className="mt-3 flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
              <input type="checkbox" name="offlineOnly" defaultChecked={config.offlineOnly} className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
              <span className="text-sm text-slate-700">
                Only outside staff hours
                <span className="mt-0.5 block text-xs text-slate-500">
                  During the hours below, chats go straight to a person instead.
                </span>
              </span>
            </label>

            <div className="mt-6 grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-3">
              <Field label={`Staff start (24h, ${tzLabel(new Date(), tz)})`} htmlFor="hoursStart">
                <input id="hoursStart" name="hoursStart" type="number" min={0} max={23} defaultValue={config.staffHoursStart} className={fieldInput} />
              </Field>
              <Field label={`Staff end (24h, ${tzLabel(new Date(), tz)})`} htmlFor="hoursEnd">
                <input id="hoursEnd" name="hoursEnd" type="number" min={0} max={23} defaultValue={config.staffHoursEnd} className={fieldInput} />
              </Field>
              <Field label="Model" htmlFor="model">
                <select id="model" name="model" defaultValue={config.model} className={fieldSelect}>
                  <option value="claude-opus-5">Claude Opus 5 — most capable</option>
                  <option value="claude-sonnet-5">Claude Sonnet 5 — cheaper</option>
                  <option value="claude-haiku-4-5">Claude Haiku 4.5 — cheapest</option>
                </select>
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Which service answers">
            <div className="space-y-3">
              {[
                {
                  value: "venice",
                  title: "Venice.ai",
                  note: "Privacy-first, and far cheaper — the small models here cost roughly $0.40 per 1,000 conversations. Venice does not retain prompts, which matters when customer order questions pass through.",
                },
                {
                  value: "anthropic",
                  title: "Anthropic (Claude) direct",
                  note: "Best answer quality. Around $6 per 1,000 conversations on Haiku, more on Opus.",
                },
              ].map((opt) => (
                <label key={opt.value} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
                  <input
                    type="radio"
                    name="provider"
                    value={opt.value}
                    defaultChecked={config.provider === opt.value}
                    className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
                  />
                  <span className="text-sm text-slate-700">
                    {opt.title}
                    <span className="mt-0.5 block text-xs text-slate-500">{opt.note}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-4 px-1 text-xs text-slate-500">
              Both use the same tools and the same rules — only the model
              changes. Each keeps its own key, so switching between them loses
              neither.
            </p>
          </SectionCard>

          <SectionCard title="Venice.ai">
            <p className="mb-5 text-xs leading-relaxed text-slate-500">
              {veniceKeyFromEnv ? (
                <>A key is set in the server environment, and that one wins.</>
              ) : hasVeniceKey ? (
                <>A key is saved. Leave this blank to keep it.</>
              ) : (
                <>
                  From venice.ai → Settings → API Keys. Venice is pay-as-you-go:
                  you buy credits with a card or crypto, so put a small amount on
                  first and watch what it actually costs.
                </>
              )}
            </p>

            <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
              <Field label={hasVeniceKey ? "Replace the Venice key" : "Venice API key"} htmlFor="veniceKey">
                <input
                  id="veniceKey"
                  name="veniceKey"
                  type="password"
                  autoComplete="off"
                  placeholder={hasVeniceKey ? "•••••••••••• (unchanged)" : "Paste your Venice key"}
                  className={fieldInput}
                />
              </Field>
              <Field label="Venice model" htmlFor="veniceModel">
                <select id="veniceModel" name="veniceModel" defaultValue={config.veniceModel} className={fieldSelect}>
                  {VENICE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {hasVeniceKey ? (
              <label className="mt-4 flex items-center gap-3 text-xs text-slate-500">
                <input type="checkbox" name="clearVeniceKey" className="h-4 w-4 accent-[var(--admin-accent)]" />
                Forget the saved Venice key
              </label>
            ) : null}

            <div className="mt-6 border-t border-slate-100 pt-5">
              <button type="submit" formAction={testVeniceConnection} className={btnGhost}>
                Test the connection
              </button>
              <span className="ml-3 text-xs text-slate-400">
                Sends one tiny message to Venice and shows what comes back —
                cheaper than finding out in front of a customer.
              </span>
            </div>

            <p className="mt-5 text-xs leading-relaxed text-slate-500">
              Every model listed supports tool calling, which the order lookup
              and password reset need. Venice offers others that do not — those
              would answer questions but silently fail to look anything up, so
              they are deliberately not offered here.
            </p>
          </SectionCard>

          <SectionCard title="Anthropic API key">
            <p className="mb-5 text-xs leading-relaxed text-slate-500">
              {keyFromEnv ? (
                <>
                  A key is set in the server environment, and that one wins.
                  Anything typed here is ignored while it is there.
                </>
              ) : hasStoredKey ? (
                <>A key is saved. Leave this blank to keep it.</>
              ) : (
                <>
                  From console.anthropic.com → API keys. You pay Anthropic per
                  message; the caps below are what stop that running away.
                </>
              )}
            </p>
            <Field label={hasStoredKey ? "Replace the key" : "API key"} htmlFor="apiKey">
              <input
                id="apiKey"
                name="apiKey"
                type="password"
                autoComplete="off"
                placeholder={hasStoredKey ? "•••••••••••• (unchanged)" : "sk-ant-..."}
                className={fieldInput}
              />
            </Field>
            {hasStoredKey ? (
              <label className="mt-4 flex items-center gap-3 text-xs text-slate-500">
                <input type="checkbox" name="clearKey" className="h-4 w-4 accent-[var(--admin-accent)]" />
                Forget the saved key
              </label>
            ) : null}
          </SectionCard>

          <SectionCard title="What it may tell customers">
            <p className="mb-5 text-xs leading-relaxed text-slate-500">
              Everything here is already visible to anyone browsing the shop —
              published products, their prices, what&apos;s on offer. Draft
              products, cost prices and anyone&apos;s order are never reachable
              from chat, whatever these say.
            </p>
            <div className="space-y-3">
              <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
                <input type="checkbox" name="shareProducts" defaultChecked={rules.shareProducts} className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
                <span className="text-sm text-slate-700">
                  Products, prices and availability
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Lets it answer &ldquo;do you sell…&rdquo;, quote a price and
                    post a product card with a Buy now button.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
                <input type="checkbox" name="shareOffers" defaultChecked={rules.shareOffers} className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
                <span className="text-sm text-slate-700">
                  Sales, deals and free-shipping thresholds
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
                <input type="checkbox" name="shareCoupons" defaultChecked={rules.shareCoupons} className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
                <span className="text-sm text-slate-700">
                  Hand out coupon codes on request
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Off by default, and worth leaving off: a code given to
                    anyone who asks is a code given to everyone.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-7 max-w-sm">
              <Field label="How much stock detail" htmlFor="stockDetail">
                <select id="stockDetail" name="stockDetail" defaultValue={rules.stockDetail} className={fieldSelect}>
                  <option value="vague">Just &ldquo;in stock&rdquo; / &ldquo;low&rdquo; / &ldquo;out of stock&rdquo; (recommended)</option>
                  <option value="exact">The exact number left</option>
                  <option value="hidden">Say nothing about stock</option>
                </select>
              </Field>
              <p className="mt-2 px-1 text-xs text-slate-500">
                Exact counts tell competitors how much you sell and how fast.
              </p>
            </div>
          </SectionCard>

          <SectionCard title="What it may do">
            <div className="space-y-3">
              <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
                <input type="checkbox" name="allowOrderLookup" defaultChecked={config.allowOrderLookup} className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
                <span className="text-sm text-slate-700">
                  Look up orders
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Needs the order number <em>and</em> the checkout email
                    together, and can only report status and tracking. It cannot
                    see addresses, phone numbers or payment details.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
                <input type="checkbox" name="allowPasswordReset" defaultChecked={config.allowPasswordReset} className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]" />
                <span className="text-sm text-slate-700">
                  Send password resets
                  <span className="mt-0.5 block text-xs text-slate-500">
                    The link only ever goes to the address itself, so asking for
                    someone else&apos;s reveals nothing.
                  </span>
                </span>
              </label>
            </div>
          </SectionCard>

          <SectionCard title="Limits">
            <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
              <Field label="Replies per conversation" htmlFor="maxReplies">
                <input id="maxReplies" name="maxReplies" type="number" min={1} max={50} defaultValue={config.maxRepliesPerThread} className={fieldInput} />
              </Field>
              <Field label="Replies per day, whole shop (0 = no cap)" htmlFor="dailyCap">
                <input id="dailyCap" name="dailyCap" type="number" min={0} defaultValue={config.dailyCap} className={fieldInput} />
              </Field>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Hitting either limit hands the conversation to a person rather
              than leaving the customer stuck. These are your bill&apos;s
              backstop — a public chat box with no cap is an open tab.
            </p>
          </SectionCard>

          <SectionCard title="Opening message">
            <Field label="Shown before the customer types" htmlFor="greeting">
              <textarea
                id="greeting"
                name="greeting"
                rows={6}
                defaultValue={config.greeting}
                className={fieldTextarea}
              />
            </Field>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Use <code className="rounded bg-slate-100 px-1">%%store%%</code>{" "}
              for the shop name. This is drawn in the widget, not written to
              the conversation — a greeting nobody answered is not a chat, and
              storing one would open a ticket every time someone glanced at the
              window.
            </p>
          </SectionCard>

          <SectionCard title="House style">
            <Field label="Anything it should know or say" htmlFor="persona">
              <textarea
                id="persona"
                name="persona"
                rows={5}
                defaultValue={config.persona}
                placeholder={"We ship from Toronto.\nSay 'hey' rather than 'Dear customer'.\nNever promise a delivery date."}
                className={fieldTextarea}
              />
            </Field>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Tone and facts only. It already reads your FAQ, policy pages and
              product descriptions, so don&apos;t duplicate those here — keep
              the answer in one place and edit the page instead.
            </p>
          </SectionCard>

          <div className="flex justify-end">
            <button type="submit" className={btnPrimary}>Save assistant settings</button>
          </div>
        </form>
      ) : (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Only a Master can change these settings.
        </p>
      )}

      <SectionCard title="What it has been doing">
        {calls.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Nothing yet. Every lookup it runs is recorded here — including the
            ones it refused.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={thCls}>When</th>
                  <th className={thCls}>Action</th>
                  <th className={thCls}>Result</th>
                  <th className={thCls}>Details</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className={`${tdCls} whitespace-nowrap`}>
                      {c.createdAt.toLocaleString("en-CA", { dateStyle: "short", timeStyle: "short", timeZone: tz })}
                    </td>
                    <td className={`${tdCls} font-medium text-slate-900`}>{c.tool}</td>
                    <td className={tdCls}>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${OUTCOME_TONE[c.outcome] ?? "bg-slate-100"}`}>
                        {c.outcome}
                      </span>
                    </td>
                    <td className={`${tdCls} text-xs text-slate-500`}>
                      {c.detail ?? c.arguments}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
