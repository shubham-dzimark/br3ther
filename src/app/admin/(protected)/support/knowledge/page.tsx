import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { Card, btnPrimary, btnDanger, Badge } from "@/components/admin/ui";
import { SectionCard, Field, fieldInput } from "@/components/admin/Field";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { getTimeZone, ymd } from "@/lib/timezone";
import { saveArticle, deleteArticle, dismissGap } from "./actions";

export const metadata: Metadata = { title: "Knowledge base" };
export const dynamic = "force-dynamic";

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    gap?: string;
    saved?: string;
    deleted?: string;
    dismissed?: string;
    error?: string;
  }>;
}) {
  await requireCapability("support");
  const sp = await searchParams;
  const tz = await getTimeZone();

  const [articles, gaps, selected, fromGap] = await Promise.all([
    prisma.knowledgeArticle.findMany({
      orderBy: [{ isActive: "desc" }, { useCount: "desc" }, { question: "asc" }],
      take: 200,
    }),
    // Only gaps still worth acting on: not answered, not dismissed.
    prisma.unansweredQuestion.findMany({
      where: { answeredById: null, dismissedAt: null },
      orderBy: [{ askedCount: "desc" }, { lastAskedAt: "desc" }],
      take: 30,
    }),
    sp.id
      ? prisma.knowledgeArticle.findUnique({ where: { id: sp.id } })
      : Promise.resolve(null),
    sp.gap
      ? prisma.unansweredQuestion.findUnique({ where: { id: sp.gap } })
      : Promise.resolve(null),
  ]);

  const editing = selected ?? null;
  const live = articles.filter((a) => a.isActive).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Knowledge base
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          The answers the assistant is allowed to give. It quotes these before
          anything else, and says it will fetch a person when none of them fit.
        </p>
      </div>

      {sp.saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved. The assistant can use it on the next message.
        </p>
      ) : null}
      {sp.deleted ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Article deleted.
        </p>
      ) : null}
      {sp.dismissed ? (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Question dismissed.
        </p>
      ) : null}
      {sp.error === "empty" ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          A question and an answer are both required.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <SectionCard title={editing ? "Edit answer" : "New answer"}>
            <p className="-mt-2 mb-5 text-sm text-slate-500">
              Write the question the way a customer would ask it &mdash;
              retrieval scores a short, specific question far better than a
              long paragraph.
            </p>
            {/* Keyed so moving between answers remounts the fields - see the
                same note on the content pages screen. */}
            <form
              key={editing?.id ?? fromGap?.id ?? "new"}
              action={saveArticle}
              className="space-y-6"
            >
              {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
              {fromGap ? <input type="hidden" name="gapId" value={fromGap.id} /> : null}

              <Field label="Question" htmlFor="question">
                <input
                  id="question"
                  name="question"
                  required
                  defaultValue={editing?.question ?? fromGap?.question ?? ""}
                  placeholder="How long does delivery take?"
                  className={fieldInput}
                />
              </Field>

              <Field label="Answer" htmlFor="answer">
                <RichTextEditor
                  name="answer"
                  initialHtml={editing?.answer ?? ""}
                  placeholder="Answer it the way you would in the shop — short and specific."
                  minHeight={200}
                />
              </Field>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <Field label="Also matches these words" htmlFor="keywords">
                    <input
                      id="keywords"
                      name="keywords"
                      defaultValue={editing?.keywords ?? ""}
                      placeholder="postage, courier, dispatch"
                      className={fieldInput}
                    />
                  </Field>
                  <p className="mt-2 px-1 text-xs text-slate-500">
                    Words a customer might use that the question doesn&rsquo;t
                    contain. Comma separated.
                  </p>
                </div>
                <Field label="Category (optional)" htmlFor="category">
                  <input
                    id="category"
                    name="category"
                    defaultValue={editing?.category ?? ""}
                    placeholder="Shipping"
                    className={fieldInput}
                  />
                </Field>
              </div>

              <label className="flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={editing ? editing.isActive : true}
                  className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
                />
                The assistant may use this answer
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" className={btnPrimary}>
                  {editing ? "Save answer" : "Add answer"}
                </button>
                {editing ? (
                  <Link
                    href="/admin/support/knowledge"
                    className="text-sm font-medium text-slate-500 hover:text-slate-800"
                  >
                    Cancel
                  </Link>
                ) : null}
              </div>
            </form>

            {editing ? (
              <form action={deleteArticle} className="mt-5 border-t border-slate-100 pt-5">
                <input type="hidden" name="id" value={editing.id} />
                <button type="submit" className={btnDanger}>
                  Delete this answer
                </button>
              </form>
            ) : null}
          </SectionCard>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
              <h2 className="text-lg font-semibold text-slate-900">
                Answers ({live} live of {articles.length})
              </h2>
            </div>
            {articles.length === 0 ? (
              <p className="px-6 pb-10 text-center text-sm text-slate-400">
                Nothing written yet. Until there is, the assistant can only hand
                policy questions to a person.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {articles.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/admin/support/knowledge?id=${a.id}`}
                      className="flex items-start justify-between gap-3 px-6 py-3.5 transition hover:bg-slate-50/70"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {a.question}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {a.category ? `${a.category} · ` : ""}
                          used {a.useCount} time{a.useCount === 1 ? "" : "s"}
                        </span>
                      </span>
                      {a.isActive ? null : <Badge tone="slate">Off</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit overflow-hidden">
          <div className="px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Asked, but unanswered
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Questions the assistant had nothing for. The count is how many
              times it has come up — answer the top one first.
            </p>
          </div>

          {gaps.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-slate-400">
              Nothing outstanding.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {gaps.map((g) => (
                <li key={g.id} className="px-5 py-3.5">
                  <p className="text-sm text-slate-700">{g.question}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    asked {g.askedCount} time{g.askedCount === 1 ? "" : "s"} ·
                    last {ymd(g.lastAskedAt, tz)}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <Link
                      href={`/admin/support/knowledge?gap=${g.id}`}
                      className="text-xs font-medium text-[var(--admin-accent)] hover:underline"
                    >
                      Write an answer
                    </Link>
                    <form action={dismissGap}>
                      <input type="hidden" name="gapId" value={g.id} />
                      <button
                        type="submit"
                        className="text-xs font-medium text-slate-400 hover:text-slate-700"
                      >
                        Dismiss
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
