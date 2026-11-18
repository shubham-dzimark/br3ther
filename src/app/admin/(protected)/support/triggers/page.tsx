import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getMoneyFormatter } from "@/lib/currency";
import { Card, btnPrimary, btnDanger, Badge } from "@/components/admin/ui";
import { SectionCard, Field, fieldInput, fieldTextarea } from "@/components/admin/Field";
import { saveTrigger, deleteTrigger } from "./actions";

export const metadata: Metadata = { title: "Chat triggers" };
export const dynamic = "force-dynamic";

export default async function TriggersPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; saved?: string; deleted?: string; error?: string }>;
}) {
  await requireCapability("support");
  const sp = await searchParams;

  const [triggers, editing, money] = await Promise.all([
    prisma.chatTrigger.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    sp.id ? prisma.chatTrigger.findUnique({ where: { id: sp.id } }) : Promise.resolve(null),
    getMoneyFormatter(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Chat triggers
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Open the chat before the customer asks. A trigger is a place, a wait
          and something to say. The first matching rule wins, so put the
          specific ones above the general ones.
        </p>
      </div>

      {sp.saved ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved. It applies on the next page a visitor loads.
        </p>
      ) : null}
      {sp.deleted ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Trigger deleted.
        </p>
      ) : null}
      {sp.error === "empty" ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          A name and a message are both required.
        </p>
      ) : null}

      <SectionCard title={editing ? "Edit trigger" : "New trigger"}>
        <form key={editing?.id ?? "new"} action={saveTrigger} className="space-y-6">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Name (only you see this)" htmlFor="name">
              <input
                id="name"
                name="name"
                required
                defaultValue={editing?.name ?? ""}
                placeholder="Help on the checkout page"
                className={fieldInput}
              />
            </Field>
            <Field label="Order (lower runs first)" htmlFor="sortOrder">
              <input
                id="sortOrder"
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={String(editing?.sortOrder ?? 0)}
                className={fieldInput}
              />
            </Field>
          </div>

          <Field label="Message the customer sees" htmlFor="message">
            <textarea
              id="message"
              name="message"
              rows={3}
              required
              defaultValue={editing?.message ?? ""}
              placeholder="Need a hand with sizing? I'm here."
              className={fieldTextarea}
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <Field label="Only on pages starting with" htmlFor="pathPrefix">
                <input
                  id="pathPrefix"
                  name="pathPrefix"
                  defaultValue={editing?.pathPrefix ?? ""}
                  placeholder="/checkout"
                  className={fieldInput}
                />
              </Field>
              <p className="mt-2 px-1 text-xs text-slate-500">
                Blank means every page. <code>/shop</code> also covers
                everything under it.
              </p>
            </div>
            <div>
              <Field label="Wait (seconds)" htmlFor="delaySeconds">
                <input
                  id="delaySeconds"
                  name="delaySeconds"
                  type="number"
                  min={0}
                  max={3600}
                  defaultValue={String(editing?.delaySeconds ?? 30)}
                  className={fieldInput}
                />
              </Field>
              <p className="mt-2 px-1 text-xs text-slate-500">
                Ignored when &ldquo;about to leave&rdquo; is ticked.
              </p>
            </div>
            <div>
              <Field label={`Only if cart is at least (${money.currency})`} htmlFor="minCart">
                <input
                  id="minCart"
                  name="minCart"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={
                    editing?.minCartCents ? String(editing.minCartCents / 100) : ""
                  }
                  placeholder="0"
                  className={fieldInput}
                />
              </Field>
              <p className="mt-2 px-1 text-xs text-slate-500">
                Blank or 0 ignores the cart entirely.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name="onExitIntent"
                defaultChecked={editing?.onExitIntent ?? false}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
              />
              <span>
                Fire when they look about to leave
                <span className="block text-xs text-slate-500">
                  The pointer heading for the tab bar, instead of a timer.
                  Desktop only &mdash; there is no equivalent gesture on a phone.
                </span>
              </span>
            </label>

            <label className="flex items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={editing ? editing.isActive : true}
                className="h-4 w-4 rounded border-slate-300 text-[var(--admin-accent)] focus:ring-[var(--admin-accent)]"
              />
              Active
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={btnPrimary}>
              {editing ? "Save trigger" : "Add trigger"}
            </button>
            {editing ? (
              <Link
                href="/admin/support/triggers"
                className="text-sm font-medium text-slate-500 hover:text-slate-800"
              >
                Cancel
              </Link>
            ) : null}
          </div>
        </form>

        {editing ? (
          <form action={deleteTrigger} className="mt-5 border-t border-slate-100 pt-5">
            <input type="hidden" name="id" value={editing.id} />
            <button type="submit" className={btnDanger}>
              Delete this trigger
            </button>
          </form>
        ) : null}
      </SectionCard>

      <Card className="overflow-hidden">
        <div className="px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Triggers ({triggers.filter((t) => t.isActive).length} active of{" "}
            {triggers.length})
          </h2>
        </div>
        {triggers.length === 0 ? (
          <p className="px-6 pb-10 text-center text-sm text-slate-400">
            None yet. Until you add one, the chat only opens when a customer
            clicks it.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {triggers.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/admin/support/triggers?id=${t.id}`}
                  className="flex items-start justify-between gap-3 px-6 py-3.5 transition hover:bg-slate-50/70"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {t.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {t.message}
                    </span>
                    <span className="mt-1 block text-[11px] text-slate-400">
                      {t.pathPrefix || "every page"} ·{" "}
                      {t.onExitIntent ? "about to leave" : `after ${t.delaySeconds}s`}
                      {t.minCartCents
                        ? ` · cart ≥ ${money.format(t.minCartCents)}`
                        : ""}
                    </span>
                  </span>
                  {t.isActive ? null : <Badge tone="slate">Off</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
