"use client";

import { useState } from "react";
import { Field, SectionCard, fieldInput, fieldTextarea } from "@/components/admin/Field";
import { btnDanger, btnGhost, btnPrimary } from "@/components/admin/ui";
import {
  MAX_COLUMNS,
  MAX_FAQ,
  MAX_RESULTS,
  PDF_MAX_BYTES,
  newId,
  type LabFaq,
  type LabResult,
  type LabResultsContent,
} from "@/lib/lab-results-data";

const today = () => new Date().toISOString().slice(0, 10);

const blankResult = (): LabResult => ({
  id: newId(),
  lab: "",
  title: "",
  columns: [
    { label: "Fabric composition", value: "" },
    { label: "Test standard", value: "" },
    { label: "Result", value: "" },
  ],
  date: today(),
  pdfUrl: "",
  pdfName: "",
  buttonLabel: "View Full Report",
});

function move<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

const iconBtn =
  "flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-30";

function Arrows({ index, count, onMove, label }: { index: number; count: number; onMove: (dir: -1 | 1) => void; label: string }) {
  return (
    <>
      <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${label} up`} className={iconBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
          <path d="m18 15-6-6-6 6" />
        </svg>
      </button>
      <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move ${label} down`} className={iconBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </>
  );
}

/**
 * Repeater editor for the Lab Results page. Everything is held in state and
 * posted as one JSON field; PDFs upload one at a time to their own route as
 * soon as they are picked, so a save never carries file bytes.
 */
export function LabResultsEditor({
  initial,
  action,
}: {
  initial: LabResultsContent;
  action: (fd: FormData) => void | Promise<void>;
}) {
  const [data, setData] = useState<LabResultsContent>(initial);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<Record<string, string>>({});

  const setResult = (id: string, patch: Partial<LabResult>) =>
    setData((d) => ({ ...d, results: d.results.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const setFaq = (id: string, patch: Partial<LabFaq>) =>
    setData((d) => ({ ...d, faq: d.faq.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));

  async function upload(resultId: string, file: File | undefined) {
    if (!file) return;
    setUploadError((e) => ({ ...e, [resultId]: "" }));
    if (file.size > PDF_MAX_BYTES) {
      setUploadError((e) => ({ ...e, [resultId]: "That PDF is over 20 MB." }));
      return;
    }
    setUploading(resultId);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/lab-results/upload", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; filename?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "Upload failed. Please try again.");
      setResult(resultId, { pdfUrl: json.url, pdfName: json.filename ?? file.name });
    } catch (e) {
      setUploadError((errs) => ({ ...errs, [resultId]: e instanceof Error ? e.message : "Upload failed." }));
    } finally {
      setUploading(null);
    }
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="payload" value={JSON.stringify(data)} />

      <SectionCard title="Page heading">
        <div className="space-y-6">
          <Field label="Title" htmlFor="lr-title">
            <input
              id="lr-title"
              value={data.title}
              maxLength={80}
              onChange={(e) => setData((d) => ({ ...d, title: e.target.value }))}
              className={fieldInput}
            />
          </Field>
          <Field label="Intro text" htmlFor="lr-intro">
            <textarea
              id="lr-intro"
              rows={3}
              maxLength={600}
              value={data.intro}
              onChange={(e) => setData((d) => ({ ...d, intro: e.target.value }))}
              className={fieldTextarea}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title={`Lab results (${data.results.length})`}>
        {data.results.length === 0 ? (
          <p className="mb-5 text-sm text-slate-500">No lab results yet. Add the first one below.</p>
        ) : (
          <ol className="mb-5 space-y-4">
            {data.results.map((r, i) => (
              <li key={r.id} className="rounded-2xl border border-slate-200 p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">
                    Result {i + 1}
                    {r.title ? <span className="font-normal text-slate-500"> &middot; {r.title}</span> : null}
                  </p>
                  <div className="flex items-center gap-2">
                    <Arrows
                      index={i}
                      count={data.results.length}
                      label="result"
                      onMove={(dir) => setData((d) => ({ ...d, results: move(d.results, i, dir) }))}
                    />
                    <button
                      type="button"
                      disabled={data.results.length >= MAX_RESULTS}
                      onClick={() =>
                        setData((d) => {
                          const copy = { ...r, id: newId(), columns: r.columns.map((c) => ({ ...c })) };
                          const results = [...d.results];
                          results.splice(i + 1, 0, copy);
                          return { ...d, results };
                        })
                      }
                      className={btnGhost}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => setData((d) => ({ ...d, results: d.results.filter((x) => x.id !== r.id) }))}
                      className={btnDanger}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2">
                  <Field label="Lab / certifier" htmlFor={`lr-lab-${r.id}`}>
                    <input
                      id={`lr-lab-${r.id}`}
                      value={r.lab}
                      maxLength={80}
                      placeholder="e.g. Intertek"
                      onChange={(e) => setResult(r.id, { lab: e.target.value })}
                      className={fieldInput}
                    />
                  </Field>
                  <Field label="Result title" htmlFor={`lr-title-${r.id}`}>
                    <input
                      id={`lr-title-${r.id}`}
                      value={r.title}
                      maxLength={120}
                      placeholder="e.g. Activewear set fabric"
                      onChange={(e) => setResult(r.id, { title: e.target.value })}
                      className={fieldInput}
                    />
                  </Field>
                  <Field label="Date of analysis" htmlFor={`lr-date-${r.id}`}>
                    <input
                      id={`lr-date-${r.id}`}
                      type="date"
                      value={r.date}
                      onChange={(e) => setResult(r.id, { date: e.target.value })}
                      className={fieldInput}
                    />
                  </Field>
                  <Field label="Button label" htmlFor={`lr-btn-${r.id}`}>
                    <input
                      id={`lr-btn-${r.id}`}
                      value={r.buttonLabel}
                      maxLength={40}
                      placeholder="View Full Report"
                      onChange={(e) => setResult(r.id, { buttonLabel: e.target.value })}
                      className={fieldInput}
                    />
                  </Field>
                </div>

                <div className="mt-6">
                  <p className="mb-1 text-sm font-medium text-slate-700">Result details</p>
                  <p className="mb-3 text-xs text-slate-500">
                    Shown as columns on the card. The date is added as the last column automatically.
                  </p>
                  <div className="space-y-2.5">
                    {r.columns.map((c, ci) => (
                      <div key={ci} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2.5">
                        <input
                          aria-label={`Detail ${ci + 1} label`}
                          value={c.label}
                          maxLength={60}
                          placeholder="Label, e.g. Composition"
                          onChange={(e) =>
                            setResult(r.id, {
                              columns: r.columns.map((x, xi) => (xi === ci ? { ...x, label: e.target.value } : x)),
                            })
                          }
                          className={fieldInput}
                        />
                        <input
                          aria-label={`Detail ${ci + 1} value`}
                          value={c.value}
                          maxLength={120}
                          placeholder="Value, e.g. 88% polyester, 12% elastane"
                          onChange={(e) =>
                            setResult(r.id, {
                              columns: r.columns.map((x, xi) => (xi === ci ? { ...x, value: e.target.value } : x)),
                            })
                          }
                          className={fieldInput}
                        />
                        <button
                          type="button"
                          onClick={() => setResult(r.id, { columns: r.columns.filter((_, xi) => xi !== ci) })}
                          aria-label={`Remove detail ${ci + 1}`}
                          className={iconBtn}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className="h-3 w-3">
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={r.columns.length >= MAX_COLUMNS}
                    onClick={() => setResult(r.id, { columns: [...r.columns, { label: "", value: "" }] })}
                    className="mt-3 text-sm font-medium text-[var(--admin-accent)] hover:underline disabled:text-slate-300 disabled:no-underline"
                  >
                    + Add detail {r.columns.length >= MAX_COLUMNS ? `(max ${MAX_COLUMNS})` : ""}
                  </button>
                </div>

                <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="mb-2 text-sm font-medium text-slate-700">Full report (PDF)</p>
                  {r.pdfUrl ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <a
                        href={r.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-2 truncate text-sm font-medium text-[var(--admin-accent)] hover:underline"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4 shrink-0">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                          <path d="M14 2v6h6" />
                        </svg>
                        <span className="truncate">{r.pdfName || "Report.pdf"}</span>
                      </a>
                      <label className={`${btnGhost} cursor-pointer`}>
                        Replace
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          className="sr-only"
                          disabled={uploading !== null}
                          onChange={(e) => {
                            void upload(r.id, e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <button type="button" onClick={() => setResult(r.id, { pdfUrl: "", pdfName: "" })} className={btnDanger}>
                        Remove PDF
                      </button>
                    </div>
                  ) : (
                    <label className={`${btnGhost} cursor-pointer`}>
                      {uploading === r.id ? "Uploading…" : "Upload PDF report"}
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="sr-only"
                        disabled={uploading !== null}
                        onChange={(e) => {
                          void upload(r.id, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                  {uploading === r.id && r.pdfUrl ? <p className="mt-2 text-xs text-slate-500">Uploading…</p> : null}
                  {uploadError[r.id] ? <p className="mt-2 text-xs text-red-600">{uploadError[r.id]}</p> : null}
                  <p className="mt-2 text-xs text-slate-400">PDF only, up to 20 MB. Without a PDF the card shows no button.</p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          disabled={data.results.length >= MAX_RESULTS}
          onClick={() => setData((d) => ({ ...d, results: [...d.results, blankResult()] }))}
          className={btnGhost}
        >
          + Add lab result
        </button>
      </SectionCard>

      <SectionCard title={`Page FAQ (${data.faq.length})`}>
        <p className="mb-5 text-xs text-slate-500">
          These questions only appear on the Lab Results page. They are separate from the main FAQ and the chat
          assistant&rsquo;s knowledge base.
        </p>
        <div className="mb-6 max-w-md">
          <Field label="FAQ heading" htmlFor="lr-faq-title">
            <input
              id="lr-faq-title"
              value={data.faqTitle}
              maxLength={80}
              onChange={(e) => setData((d) => ({ ...d, faqTitle: e.target.value }))}
              className={fieldInput}
            />
          </Field>
        </div>
        {data.faq.length > 0 ? (
          <ol className="mb-5 space-y-4">
            {data.faq.map((f, i) => (
              <li key={f.id} className="rounded-2xl border border-slate-200 p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Question {i + 1}</p>
                  <div className="flex items-center gap-2">
                    <Arrows
                      index={i}
                      count={data.faq.length}
                      label="question"
                      onMove={(dir) => setData((d) => ({ ...d, faq: move(d.faq, i, dir) }))}
                    />
                    <button
                      type="button"
                      onClick={() => setData((d) => ({ ...d, faq: d.faq.filter((x) => x.id !== f.id) }))}
                      className={btnDanger}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="space-y-6">
                  <Field label="Question" htmlFor={`lr-q-${f.id}`}>
                    <input
                      id={`lr-q-${f.id}`}
                      value={f.question}
                      maxLength={200}
                      onChange={(e) => setFaq(f.id, { question: e.target.value })}
                      className={fieldInput}
                    />
                  </Field>
                  <Field label="Answer" htmlFor={`lr-a-${f.id}`}>
                    <textarea
                      id={`lr-a-${f.id}`}
                      rows={3}
                      maxLength={4000}
                      value={f.answer}
                      onChange={(e) => setFaq(f.id, { answer: e.target.value })}
                      className={fieldTextarea}
                    />
                  </Field>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        <button
          type="button"
          disabled={data.faq.length >= MAX_FAQ}
          onClick={() => setData((d) => ({ ...d, faq: [...d.faq, { id: newId(), question: "", answer: "" }] }))}
          className={btnGhost}
        >
          + Add question
        </button>
        <p className="mt-3 text-xs text-slate-400">A question needs both a question and an answer to be saved.</p>
      </SectionCard>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <button
          type="submit"
          disabled={uploading !== null}
          className={`${btnPrimary} shadow-lg disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {uploading ? "Waiting for upload…" : "Save lab results"}
        </button>
      </div>
    </form>
  );
}
