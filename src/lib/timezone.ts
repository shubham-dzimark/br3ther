import { cache } from "react";
import { getSettings, SETTING_KEYS } from "@/lib/settings";

/**
 * Store time zone.
 *
 * The server runs in UTC and every timestamp is stored in UTC, which is right.
 * What was wrong is that the *display* was UTC too: an order placed at 6pm in
 * Vancouver showed as the next day's date, and the dashboard's "today" rolled
 * over at 5pm local. Everything a person reads is now rendered in the store's
 * own zone; nothing about what is stored changes.
 */
export const DEFAULT_TZ = "America/Vancouver";

export const getTimeZone = cache(async (): Promise<string> => {
  const settings = await getSettings();
  const tz = settings[SETTING_KEYS.storeTimezone];
  return isValidTimeZone(tz) ? tz : DEFAULT_TZ;
});

export function isValidTimeZone(tz: string | undefined | null): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The zone's UTC offset at a given instant, in milliseconds. */
function offsetAt(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  // "hour" comes back as 24 at midnight under hour12:false in some engines.
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asIfUtc - date.getTime() + (date.getTime() % 1000);
}

const pad = (n: number) => String(n).padStart(2, "0");

function partsIn(date: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(p.find((x) => x.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
  };
}

/** "2026-09-08" in the store's zone. */
export function ymd(date: Date, tz: string): string {
  const p = partsIn(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "2026-09-08 18:40" in the store's zone. */
export function ymdhm(date: Date, tz: string): string {
  const p = partsIn(date, tz);
  return `${ymd(date, tz)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** "2026-09" in the store's zone - the key monthly buckets are grouped by. */
export function ym(date: Date, tz: string): string {
  const p = partsIn(date, tz);
  return `${p.year}-${pad(p.month)}`;
}

/** Zero-based month, for bucketing a calendar year. */
export function monthIndex(date: Date, tz: string): number {
  return partsIn(date, tz).month - 1;
}

export function yearOf(date: Date, tz: string): number {
  return partsIn(date, tz).year;
}

/**
 * The instant at which a given local date starts.
 *
 * Applied twice because the offset itself depends on the instant: on a DST
 * boundary the first guess lands in the wrong offset, and the second pass
 * corrects it.
 */
export function zonedStart(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let ts = wall;
  for (let i = 0; i < 2; i++) ts = wall - offsetAt(new Date(ts), tz);
  return new Date(ts);
}

/**
 * Value for an <input type="datetime-local">: "YYYY-MM-DDTHH:mm" of the store's
 * wall clock. Rendering the UTC clock here is what made an 11am Pacific end
 * time show as 6pm in the field.
 */
export function toLocalInput(date: Date, tz: string): string {
  return ymdhm(date, tz).replace(" ", "T");
}

/**
 * The inverse. `new Date("2026-09-08T18:00")` would read the string in the
 * *server's* zone, which is UTC here - so what staff typed as 6pm Pacific was
 * stored as 6pm UTC, seven hours early.
 */
export function fromLocalInput(value: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const d = zonedStart(
    tz,
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Midnight in the store's zone, as an instant. */
export function startOfDay(date: Date, tz: string): Date {
  const p = partsIn(date, tz);
  return zonedStart(tz, p.year, p.month, p.day);
}

export function startOfYear(date: Date, tz: string, yearsBack = 0): Date {
  return zonedStart(tz, partsIn(date, tz).year - yearsBack, 1, 1);
}

/** Human date, e.g. "Sep 8, 2026", in the store's zone. */
export function niceDate(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** Human date and time, e.g. "Sep 8, 2026, 6:40 p.m." */
export function niceDateTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Short zone label for a heading, e.g. "PDT". */
export function tzLabel(date: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    timeZoneName: "short",
  }).formatToParts(date);
  return p.find((x) => x.type === "timeZoneName")?.value ?? tz;
}

/*
 * Selectable zones. Canadian ones first - this is where the shop trades - then
 * the common US set, and UTC for anyone who wants raw server time.
 */
export const TIMEZONES = [
  { code: "America/Vancouver", label: "Pacific — Vancouver (PST/PDT)" },
  { code: "America/Edmonton", label: "Mountain — Edmonton (MST/MDT)" },
  { code: "America/Winnipeg", label: "Central — Winnipeg (CST/CDT)" },
  { code: "America/Toronto", label: "Eastern — Toronto (EST/EDT)" },
  { code: "America/Halifax", label: "Atlantic — Halifax (AST/ADT)" },
  { code: "America/St_Johns", label: "Newfoundland — St. John’s (NST/NDT)" },
  { code: "America/Los_Angeles", label: "Pacific — Los Angeles (PST/PDT)" },
  { code: "America/Denver", label: "Mountain — Denver (MST/MDT)" },
  { code: "America/Chicago", label: "Central — Chicago (CST/CDT)" },
  { code: "America/New_York", label: "Eastern — New York (EST/EDT)" },
  { code: "UTC", label: "UTC" },
] as const;
