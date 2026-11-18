import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/permissions";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { getTranslateConfig } from "@/lib/translate";
import { SectionCard, Field, fieldInput, fieldSelect } from "@/components/admin/Field";
import { btnPrimary, Card } from "@/components/admin/ui";
import { IconTrash, IconSearch } from "@/components/admin/Icons";
import {
  deleteTranslation,
  saveTranslateSettings,
  saveTranslation,
  translateEverything,
} from "./actions";

export const metadata: Metadata = { title: "Translations" };
export const dynamic = "force-dynamic";

export default async function TranslationsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; n?: string; q?: string }>;
}) {
  await requireCapability("content");
  const [{ saved, error, n, q: rawQ }, s, config] = await Promise.all([
    searchParams,
    getSettings(),
    getTranslateConfig(),
  ]);
  const q = (rawQ ?? "").trim();

  const [rows, total, autoCount] = await Promise.all([
    prisma.translation.findMany({
      where: {
        locale: "fr",
        ...(q
          ? {
              OR: [
                { source: { contains: q, mode: "insensitive" as const } },
                { value: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.translation.count({ where: { locale: "fr" } }),
    prisma.translation.count({ where: { locale: "fr", isAuto: true } }),
  ]);

  const hasKey = Boolean(s[SETTING_KEYS.translateApiKey]);

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Translations
        </h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            {saved === "swept" ? `${n} new translations` : "Saved"}
          </span>
        ) : null}
      </div>
      <p className="-mt-2 text-sm text-slate-500">
        French for everything you type into the shop &mdash; menus, categories,
        pages, product copy.
      </p>

      {error === "provider" ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Choose a translation service and turn it on before running a sweep.
        </p>
      ) : null}

      <div
        className={`rounded-2xl border px-4 py-3.5 text-sm ${
          config.enabled
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        {config.enabled ? (
          <>
            <strong className="font-semibold">Translation is on.</strong> {total}{" "}
            phrase{total === 1 ? "" : "s"} stored, {autoCount} of them machine
            made.
          </>
        ) : (
          <>
            <strong className="font-semibold">Translation is off.</strong> The
            French switch still changes prices and dates, and the built-in
            interface wording, but your own content stays in English.
          </>
        )}
      </div>

      <form action={saveTranslateSettings}>
        <SectionCard title="Quick option — Google's browser widget">
          <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
            <input
              type="checkbox"
              name="widget"
              defaultChecked={s[SETTING_KEYS.translateWidget] === "1"}
              className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
            />
            <span className="text-sm text-slate-700">
              Use Google&rsquo;s free website translator
              <span className="mt-0.5 block text-xs text-slate-500">
                The same thing WordPress plugins use. No key, no setup, and it
                translates everything on the page including product names.
              </span>
            </span>
          </label>

          <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-500">
            <p>
              <strong className="text-slate-700">How it differs:</strong> Google
              translates the page <em>in the visitor&rsquo;s browser</em> after
              it loads. That makes it free and instant across the whole site,
              but it also means:
            </p>
            <ul className="mt-2.5 list-disc space-y-1 pl-5">
              <li>
                Google does not index the French version, so it wins you no
                French search traffic. The stored translations below do.
              </li>
              <li>
                You cannot correct a bad phrase &mdash; Google decides the
                wording. Below, you can.
              </li>
              <li>
                Emails, invoices and packing slips stay English; nothing outside
                the browser is touched.
              </li>
            </ul>
            <p className="mt-2.5">
              Turn it on for immediate coverage, and use the stored translations
              underneath for the pages that matter to search. They work together
              &mdash; a stored phrase is already French before Google sees it.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Stored translations — service">
          <label className="mb-7 flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={config.enabled}
              className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
            />
            <span className="text-sm text-slate-700">
              Translate my content into French
              <span className="mt-0.5 block text-xs text-slate-500">
                Each phrase is translated once and then stored, so the shop
                never waits on the service twice for the same words.
              </span>
            </span>
          </label>

          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Service" htmlFor="provider">
              <select
                id="provider"
                name="provider"
                defaultValue={config.provider}
                className={fieldSelect}
              >
                <option value="none">None &mdash; I&apos;ll type them myself</option>
                <option value="libre">LibreTranslate (free / self-hosted)</option>
                <option value="deepl">DeepL</option>
                <option value="google">Google Translate</option>
              </select>
            </Field>
            <Field
              label={hasKey ? "API key (saved — type to replace)" : "API key"}
              htmlFor="apiKey"
            >
              <input
                id="apiKey"
                name="apiKey"
                type="password"
                autoComplete="off"
                placeholder={hasKey ? "••••••••••••" : "Not needed for LibreTranslate"}
                className={fieldInput}
              />
            </Field>
          </div>

          <div className="mt-7">
            <Field label="Endpoint (optional)" htmlFor="endpoint">
              <input
                id="endpoint"
                name="endpoint"
                defaultValue={s[SETTING_KEYS.translateEndpoint]}
                placeholder="https://libretranslate.com/translate"
                className={fieldInput}
              />
            </Field>
          </div>

          <label className="mt-7 flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
            <input
              type="checkbox"
              name="autoOnRender"
              defaultChecked={config.autoOnRender}
              className="mt-0.5 h-4 w-4 accent-[var(--admin-accent)]"
            />
            <span className="text-sm text-slate-700">
              Translate new text the first time it&rsquo;s shown
              <span className="mt-0.5 block text-xs text-slate-500">
                Off, only phrases already in the table below are translated, so
                nothing reaches the service unless you run a sweep.
              </span>
            </span>
          </label>

          <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-500">
            <strong className="text-slate-700">DeepL</strong> is the best French
            of the three and has a free tier.{" "}
            <strong className="text-slate-700">LibreTranslate</strong> needs no
            key but the public instance is rate-limited &mdash; fine for a
            one-off sweep, not for live traffic. Machine French is a starting
            point: read anything customer-facing before you rely on it, and
            correct it below. Hand edits are never overwritten.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button type="submit" className={btnPrimary}>Save</button>
          </div>
        </SectionCard>
      </form>

      <SectionCard title="Translate everything now">
        <p className="mb-5 text-sm text-slate-600">
          Walks your menus, categories, pages, product copy and homepage text,
          and translates anything not already stored.
        </p>
        <form action={translateEverything}>
          <button type="submit" className={btnPrimary}>
            Run a full sweep
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-500">
          Safe to run repeatedly &mdash; phrases already stored are skipped, and
          anything you edited by hand is left alone.
        </p>
      </SectionCard>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
          <h2 className="text-lg font-semibold text-slate-900">
            Stored phrases ({total})
          </h2>
        </div>

        <form action="/admin/settings/translations" className="px-6 py-5">
          <div className="relative max-w-sm">
            <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search English or French"
              className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm outline-none focus:border-[var(--admin-accent)]"
            />
          </div>
        </form>

        {rows.length === 0 ? (
          <p className="px-6 pb-12 text-center text-sm text-slate-500">
            {q ? "Nothing matches that." : "Nothing stored yet — run a sweep, or add one below."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.id} className="px-6 py-4">
                <form action={saveTranslation} className="flex flex-wrap items-start gap-3">
                  <input type="hidden" name="source" value={row.source} />
                  <input type="hidden" name="locale" value={row.locale} />

                  <div className="min-w-0 flex-1 basis-[240px]">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      English
                    </p>
                    <p className="mt-1 line-clamp-3 text-sm text-slate-700">{row.source}</p>
                  </div>

                  <div className="min-w-0 flex-1 basis-[240px]">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      French
                      {row.isAuto ? (
                        <span className="ml-2 rounded-full bg-[#F5EDDA] px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-[#8a6d1f]">
                          machine
                        </span>
                      ) : null}
                    </label>
                    <textarea
                      name="value"
                      rows={2}
                      defaultValue={row.value}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--admin-accent)]"
                    />
                  </div>

                  <div className="flex shrink-0 items-center gap-2 pt-6">
                    <button
                      type="submit"
                      className="rounded-full border border-[var(--admin-accent)] px-3.5 py-1.5 text-xs font-semibold text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/5"
                    >
                      Save
                    </button>
                  </div>
                </form>

                <form action={deleteTranslation} className="mt-2 flex justify-end">
                  <input type="hidden" name="id" value={row.id} />
                  <button
                    type="submit"
                    aria-label="Delete this translation"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <form action={saveTranslation}>
        <SectionCard title="Add a phrase by hand">
          <input type="hidden" name="locale" value="fr" />
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="English" htmlFor="new-source">
              <input id="new-source" name="source" required className={fieldInput} />
            </Field>
            <Field label="French" htmlFor="new-value">
              <input id="new-value" name="value" required className={fieldInput} />
            </Field>
          </div>
          <p className="mt-4 px-1 text-xs text-slate-500">
            The English must match the text on the site exactly, including
            punctuation &mdash; that is how a phrase is matched.
          </p>
          <div className="mt-7 flex justify-end">
            <button type="submit" className={btnPrimary}>Add</button>
          </div>
        </SectionCard>
      </form>
    </div>
  );
}
