/**
 * Display helpers for order lists. These never change stored data: the order
 * number on record stays "NL-2026-0009" because the CSV tracking import matches
 * on it, and it is what the customer sees on slips and in email.
 */

/**
 * The one way an order number is written for a person: "#0001".
 *
 * Four digits is the floor, not the ceiling - 1 through 9999 are padded
 * (#0001 ... #9999) and anything past that keeps its own length (#10000), so
 * the column stays aligned without ever truncating a real number. A stored
 * number that carries a prefix shows its tail ("NL-2026-9" -> "#0009"), and a
 * value with no digits at all is shown as it stands rather than as "#".
 *
 * Machine-read copies of the number - the e-Transfer reference a customer
 * types into their bank, barcodes, CSV exports, portal and gateway payloads -
 * keep the stored value and must not use this.
 */
export function orderNo(orderNumber: string): string {
  const tail = /(\d+)\s*$/.exec(String(orderNumber ?? ""));
  return tail ? `#${tail[1].padStart(4, "0")}` : String(orderNumber ?? "");
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Recent timestamps read better as an interval ("2 hours ago"); anything older
 * than a day is more useful as a plain date. `now` is injectable so the output
 * is testable rather than depending on the wall clock, and `timeZone` renders
 * the date in the store's zone rather than the server's.
 */
export function relativeDate(
  value: Date,
  now: Date = new Date(),
  timeZone?: string,
): string {
  const diff = now.getTime() - value.getTime();
  const opts: Intl.DateTimeFormatOptions = {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  };

  if (diff < 0) return value.toLocaleDateString("en-CA", opts);
  if (diff < MINUTE) return "just now";

  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  return value.toLocaleDateString("en-CA", opts);
}
