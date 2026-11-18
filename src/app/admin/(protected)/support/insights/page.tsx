import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { Card, StatCard } from "@/components/admin/ui";
import { StatusBars } from "@/components/admin/RevenueChart";
import { CountBars, type CountPoint } from "@/components/admin/CountBars";
import { getTimeZone, ymd } from "@/lib/timezone";

export const metadata: Metadata = { title: "Assistant insights" };
export const dynamic = "force-dynamic";

const TOOL_LABEL: Record<string, string> = {
  search_store: "Answered from the shop's own words",
  search_products: "Product search",
  product_details: "Product details",
  store_offers: "Offers and discounts",
  lookup_order: "Order lookup",
  my_orders: "Signed-in order list",
  send_password_reset: "Password reset sent",
  hand_to_human: "Handed to a person",
};

const OUTCOME_COLOR: Record<string, string> = {
  ok: "#1A6FB5",
  not_found: "#B4802A",
  denied: "#3B82F6",
  error: "#F43F5E",
};

export default async function AssistantInsightsPage() {
  await requireCapability("support");
  const tz = await getTimeZone();

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 864e5);
  const d14 = new Date(now.getTime() - 13 * 864e5);
  d14.setUTCHours(0, 0, 0, 0);

  const [
    conversations,
    escalated,
    aiMessages,
    staffMessages,
    customerMessages,
    toolGroups,
    topArticles,
    liveArticles,
    openGaps,
    topGaps,
    recentTickets,
  ] = await Promise.all([
    prisma.ticket.count({ where: { createdAt: { gte: d30 } } }),
    prisma.ticket.count({
      where: { createdAt: { gte: d30 }, escalatedAt: { not: null } },
    }),
    prisma.ticketMessage.count({ where: { createdAt: { gte: d30 }, fromAi: true } }),
    prisma.ticketMessage.count({
      where: { createdAt: { gte: d30 }, fromStaff: true, fromAi: false },
    }),
    prisma.ticketMessage.count({ where: { createdAt: { gte: d30 }, fromStaff: false } }),
    prisma.aiToolCall.groupBy({
      by: ["tool", "outcome"],
      _count: { _all: true },
      where: { createdAt: { gte: d30 } },
    }),
    prisma.knowledgeArticle.findMany({
      where: { useCount: { gt: 0 } },
      orderBy: { useCount: "desc" },
      take: 6,
      select: { id: true, question: true, useCount: true },
    }),
    prisma.knowledgeArticle.count({ where: { isActive: true } }),
    prisma.unansweredQuestion.count({
      where: { answeredById: null, dismissedAt: null },
    }),
    prisma.unansweredQuestion.findMany({
      where: { answeredById: null, dismissedAt: null },
      orderBy: [{ askedCount: "desc" }, { lastAskedAt: "desc" }],
      take: 6,
      select: { id: true, question: true, askedCount: true, lastAskedAt: true },
    }),
    prisma.ticket.findMany({
      where: { createdAt: { gte: d14 } },
      select: { createdAt: true },
    }),
  ]);

  /*
   * "Resolved" means the assistant handled it without fetching a person. It is
   * deliberately conservative: a thread is only counted as resolved if nobody
   * escalated it, so the number never flatters the assistant.
   */
  const resolved = conversations - escalated;
  const resolutionRate =
    conversations > 0 ? Math.round((resolved / conversations) * 100) : null;

  // Fourteen days, zero-filled so quiet days show as gaps rather than vanishing.
  const buckets = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 864e5);
    buckets.set(ymd(d, tz), 0);
  }
  for (const t of recentTickets) {
    const key = ymd(t.createdAt, tz);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const daily: CountPoint[] = [...buckets].map(([date, value]) => ({
    label: date.slice(5),
    caption: date,
    value,
  }));

  // Tool usage, most-used first, with each outcome kept separate - a tool that
  // runs often but mostly returns not_found is a content problem, not success.
  const byTool = new Map<string, { outcome: string; count: number }[]>();
  for (const g of toolGroups) {
    const list = byTool.get(g.tool) ?? [];
    list.push({ outcome: g.outcome, count: g._count._all });
    byTool.set(g.tool, list);
  }
  const tools = [...byTool.entries()]
    .map(([tool, outcomes]) => ({
      tool,
      outcomes: outcomes.sort((a, b) => b.count - a.count),
      total: outcomes.reduce((n, o) => n + o.count, 0),
    }))
    .sort((a, b) => b.total - a.total);

  const outcomeRows = ["ok", "not_found", "denied", "error"].map((o) => ({
    label:
      o === "ok"
        ? "Answered"
        : o === "not_found"
          ? "Nothing found"
          : o === "denied"
            ? "Refused (not allowed)"
            : "Failed",
    count: toolGroups
      .filter((g) => g.outcome === o)
      .reduce((n, g) => n + g._count._all, 0),
    color: OUTCOME_COLOR[o],
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Assistant insights
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Last 30 days. A conversation counts as resolved only if nobody had to
          step in, so this never flatters the assistant.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="mint" label="Conversations" value={String(conversations)} />
        <StatCard tone="green" label="Handled without a person" value={String(resolved)} />
        <StatCard tone="yellow" label="Handed to a person" value={String(escalated)} />
        <StatCard
          tone="lavender"
          label="Resolution rate"
          value={resolutionRate == null ? "—" : `${resolutionRate}%`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="peach" label="Customer messages" value={String(customerMessages)} />
        <StatCard tone="blue" label="Assistant replies" value={String(aiMessages)} />
        <StatCard tone="orange" label="Staff replies" value={String(staffMessages)} />
        <StatCard
          tone="pink"
          label="Unanswered questions"
          value={String(openGaps)}
          href="/admin/support/knowledge"
        />
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Conversations started
        </h2>
        <p className="mb-5 text-sm text-slate-500">Last 14 days.</p>
        <CountBars points={daily} unit="conversations" />
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">What it did</h2>
          <p className="mb-5 text-sm text-slate-500">
            Every tool the assistant reached for, and how it went.
          </p>

          {tools.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              No assistant activity in this period.
            </p>
          ) : (
            <ul className="space-y-3.5">
              {tools.map((t) => (
                <li key={t.tool}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700">
                      {TOOL_LABEL[t.tool] ?? t.tool}
                    </span>
                    <span className="shrink-0 tabular-nums font-semibold text-slate-900">
                      {t.total}
                    </span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                    {t.outcomes.map((o) => (
                      <span
                        key={o.outcome}
                        title={`${o.outcome}: ${o.count}`}
                        style={{
                          width: `${(o.count / t.total) * 100}%`,
                          backgroundColor: OUTCOME_COLOR[o.outcome] ?? "#94A3B8",
                        }}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900">Outcomes</h2>
          <p className="mb-5 text-sm text-slate-500">
            Across every tool call.
          </p>
          <StatusBars rows={outcomeRows} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="px-6 py-5">
            <h2 className="text-lg font-semibold text-slate-900">
              Hardest-working answers
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {liveArticles} answer{liveArticles === 1 ? "" : "s"} live. These
              are the ones actually being used.
            </p>
          </div>
          {topArticles.length === 0 ? (
            <p className="px-6 pb-8 text-sm text-slate-400">
              None used yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {topArticles.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/admin/support/knowledge?id=${a.id}`}
                    className="flex items-center justify-between gap-3 px-6 py-3 text-sm transition hover:bg-slate-50/70"
                  >
                    <span className="min-w-0 truncate text-slate-700">
                      {a.question}
                    </span>
                    <span className="shrink-0 tabular-nums font-semibold text-slate-900">
                      {a.useCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="px-6 py-5">
            <h2 className="text-lg font-semibold text-slate-900">
              Biggest gaps
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Asked most often, still unanswered. Fill the top one first.
            </p>
          </div>
          {topGaps.length === 0 ? (
            <p className="px-6 pb-8 text-sm text-slate-400">
              Nothing outstanding.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {topGaps.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/admin/support/knowledge?gap=${g.id}`}
                    className="flex items-center justify-between gap-3 px-6 py-3 text-sm transition hover:bg-slate-50/70"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-slate-700">
                        {g.question}
                      </span>
                      <span className="text-xs text-slate-400">
                        last asked {ymd(g.lastAskedAt, tz)}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums font-semibold text-slate-900">
                      {g.askedCount}×
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
