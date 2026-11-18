import { sanitizeRichText, sanitizeShortText } from "@/lib/rich-text";

/**
 * Spec tables for product descriptions.
 *
 * Rows are stored as JSON so they stay rows: editable one at a time, and
 * restyleable across the whole shop later. A table pasted into the rich text
 * editor becomes markup nobody wants to maintain.
 */

export type SpecRow = { label: string; value: string };

export const MAX_ROWS = 40;
/** Characters of markup one cell may hold, measured on the way in. */
export const MAX_VALUE = 8000;
/*
 * Reading back allows more than writing does. Sanitising closes whatever the
 * incoming trim left open, so a cell saved at the limit comes back a little
 * longer than the limit - cutting it to MAX_VALUE again would take the
 * closing tags off and leave the cell broken on the page. The looser cap is
 * only a guard against absurd stored junk, never a trim of our own writing.
 */
const READ_CAP = MAX_VALUE * 2;

/** Never trust stored JSON - it is only as good as whatever last wrote it. */
export function parseSpecTable(raw: string | null | undefined): SpecRow[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
      .map((r) => ({
        label: String(r.label ?? "").slice(0, 200),
        value: String(r.value ?? "").slice(0, READ_CAP),
      }))
      .filter((r) => r.label.trim() || r.value.trim())
      .slice(0, MAX_ROWS);
  } catch {
    return [];
  }
}

/**
 * Clean rows on the way in.
 *
 * A row's value is written in the same editor as everything else in the
 * admin, so it is cleaned by the same allowlist: a list, a heading or a
 * coloured word typed into a cell is kept, and anything executable is not.
 *
 * The length cap is applied to what arrived, before sanitising - cutting
 * sanitised markup at a fixed number of characters would slice a tag in half
 * and leave the cell broken. Trimming first lets the sanitiser close whatever
 * the cut left open.
 */
export function serialiseSpecTable(rows: SpecRow[]): string {
  const clean = rows
    .map((r) => ({
      label: sanitizeShortText(r.label ?? "").slice(0, 200),
      value: sanitizeRichText(String(r.value ?? "").slice(0, MAX_VALUE)),
    }))
    .filter((r) => r.label.trim() || r.value.trim())
    .slice(0, MAX_ROWS);

  return clean.length ? JSON.stringify(clean) : "";
}

/** "text" unless the value is explicitly "table". */
export function specFormat(value: string | null | undefined): "text" | "table" {
  return value === "table" ? "table" : "text";
}

/**
 * Is there anything to show?
 *
 * A product set to "table" with no rows falls back to its prose rather than
 * rendering an empty box - the choice of format should not be able to blank
 * the page.
 */
export function hasSpecRows(format: string | null | undefined, raw: string | null | undefined): boolean {
  return specFormat(format) === "table" && parseSpecTable(raw).length > 0;
}

