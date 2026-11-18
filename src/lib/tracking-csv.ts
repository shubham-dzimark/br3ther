import "server-only";
import type { Carrier } from "@/lib/carriers";

/** Columns written by the export and expected back by the import. */
export const CSV_HEADERS = [
  "order_number",
  "customer",
  "address",
  "city",
  "region",
  "postal_code",
  "country",
  "carrier",
  "tracking_number",
  "shipped_date",
] as const;

/** RFC4180-ish: quote anything containing a comma, quote or newline. */
export function csvCell(value: string | null | undefined): string {
  const v = (value ?? "").toString();
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function csvRow(cells: (string | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * Split one CSV line, honouring quoted fields. Deliberately hand-rolled: the
 * files here are a handful of columns produced by our own export or a courier's
 * spreadsheet, and a parser dependency would be more surface than it is worth.
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Strips a UTF-8 BOM, which Excel writes and would corrupt the first header. */
export function splitCsvLines(text: string): string[] {
  return text
    .replace(/^﻿/, "")
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim() !== "");
}

/**
 * Match a carrier by key or display name, case-insensitively, so a sheet
 * saying "Canada Post", "canada-post" or "CANADAPOST" all resolve.
 */
export function resolveCarrier(carriers: Carrier[], input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  const squashed = raw.replace(/[^a-z]/g, "");
  const hit = carriers.find(
    (c) =>
      c.key === raw ||
      c.name.toLowerCase() === raw ||
      c.key.replace(/[^a-z]/g, "") === squashed ||
      c.name.toLowerCase().replace(/[^a-z]/g, "") === squashed,
  );
  return hit ? hit.key : null;
}

/**
 * Parse a date in the format the operator picked. Ambiguous by nature -
 * 03/04/2026 is either March or April - so the format is an explicit choice
 * rather than a guess. Returns null for anything unparseable.
 */
export function parseShippedDate(
  input: string,
  order: "dmy" | "mdy",
): Date | null {
  const raw = input.trim();
  if (!raw) return null;

  // ISO first: unambiguous, and what our own export writes.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parts = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(raw);
  if (!parts) return null;

  const a = +parts[1];
  const b = +parts[2];
  let year = +parts[3];
  if (year < 100) year += 2000;

  const day = order === "dmy" ? a : b;
  const month = order === "dmy" ? b : a;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const d = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31/02 and friends, which Date would otherwise roll forward.
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}
