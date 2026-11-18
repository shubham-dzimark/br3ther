/*
 * Lab Results page content: the page heading, any number of lab reports (each
 * with its own detail columns and a PDF), and a FAQ that belongs to this page
 * only - it is not the knowledge-base FAQ used by /pages/faq and the chat.
 *
 * Stored as one JSON StoreSetting. Plain functions with no server imports, so
 * the admin editor in the browser and the server share the same rules.
 */

export const LAB_RESULTS_KEY = "lab_results.page";
export const MAX_RESULTS = 50;
export const MAX_COLUMNS = 6;
export const MAX_FAQ = 40;
export const PDF_MAX_BYTES = 20_000_000; // 20 MB

export type LabColumn = { label: string; value: string };

export type LabResult = {
  id: string;
  /** Who did the testing, shown as the pill at the top of the card. */
  lab: string;
  title: string;
  columns: LabColumn[];
  /** YYYY-MM-DD, or "" for none. */
  date: string;
  /** Only ever a PDF this site stored: /uploads/<uuid>.pdf */
  pdfUrl: string;
  pdfName: string;
  buttonLabel: string;
};

export type LabFaq = { id: string; question: string; answer: string };

export type LabResultsContent = {
  title: string;
  intro: string;
  faqTitle: string;
  results: LabResult[];
  faq: LabFaq[];
};

export const DEFAULT_LAB_RESULTS: LabResultsContent = {
  title: "Lab Results",
  intro:
    "Our fabrics are tested by independent laboratories. Click “View Full Report” to open the full test certificate.",
  faqTitle: "Lab results FAQ",
  results: [],
  faq: [],
};

const PDF_URL = /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `id${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** One line of text: collapsed whitespace, trimmed, capped. */
function line(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Multi-line text: keeps line breaks, trims, caps. */
function text(v: unknown, max: number): string {
  return typeof v === "string"
    ? v.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max)
    : "";
}

export function isStoredPdf(url: string): boolean {
  return PDF_URL.test(url);
}

function validDate(v: unknown): string {
  if (typeof v !== "string" || !DATE.test(v)) return "";
  return Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) ? "" : v;
}

/** Whatever is stored or posted, as clean content the page can render. */
export function sanitizeLabResults(raw: unknown): LabResultsContent {
  // Nothing usable saved: the page shows its default heading and intro.
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_LAB_RESULTS;
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const uniqueId = (v: unknown) => {
    let id = typeof v === "string" && ID.test(v) ? v : newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    return id;
  };

  const results: LabResult[] = (Array.isArray(r.results) ? r.results : [])
    .map((item): LabResult | null => {
      if (!item || typeof item !== "object") return null;
      const x = item as Record<string, unknown>;
      const columns = (Array.isArray(x.columns) ? x.columns : [])
        .map((c) => {
          const col = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
          return { label: line(col.label, 60), value: line(col.value, 120) };
        })
        .filter((c) => c.label || c.value)
        .slice(0, MAX_COLUMNS);
      const pdfUrl = typeof x.pdfUrl === "string" && isStoredPdf(x.pdfUrl) ? x.pdfUrl : "";
      const result = {
        id: "",
        lab: line(x.lab, 80),
        title: line(x.title, 120),
        columns,
        date: validDate(x.date),
        pdfUrl,
        pdfName: pdfUrl ? line(x.pdfName, 200) : "",
        buttonLabel: line(x.buttonLabel, 40),
      };
      // A card with nothing in it would render as an empty box.
      if (!result.title && !result.lab && columns.length === 0 && !pdfUrl) return null;
      return { ...result, id: uniqueId(x.id) };
    })
    .filter((x): x is LabResult => x !== null)
    .slice(0, MAX_RESULTS);

  const faq: LabFaq[] = (Array.isArray(r.faq) ? r.faq : [])
    .map((item): LabFaq | null => {
      if (!item || typeof item !== "object") return null;
      const x = item as Record<string, unknown>;
      const question = line(x.question, 200);
      const answer = text(x.answer, 4000);
      return question && answer ? { id: uniqueId(x.id), question, answer } : null;
    })
    .filter((x): x is LabFaq => x !== null)
    .slice(0, MAX_FAQ);

  return {
    title: line(r.title, 80) || DEFAULT_LAB_RESULTS.title,
    intro: text(r.intro, 600),
    faqTitle: line(r.faqTitle, 80) || DEFAULT_LAB_RESULTS.faqTitle,
    results,
    faq,
  };
}

/** "2025-06-18" -> "June 18, 2025", without the server's timezone shifting the day. */
export function formatLabDate(date: string, locale = "en-US"): string {
  if (!validDate(date)) return "";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
