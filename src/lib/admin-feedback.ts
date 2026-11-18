/**
 * "Did that save?" feedback for the admin.
 *
 * Admin actions finish with a redirect that carries a flag - `?saved=1`,
 * `?deleted=1`, `?error=name` and so on. Saving the same screen twice
 * redirected to the URL it was already on, so nothing on the page changed and
 * there was no way to tell the second save had happened. The ActionToast turns
 * each flag into a short message and then drops the flags from the address bar,
 * so the next save lands on a new URL and is announced again.
 *
 * Plain module (no server-only), so the browser and the tests use the same rules.
 */

export type Feedback = { tone: "ok" | "warn" | "bad"; text: string };

/** Flags and their companion values. Anything else in the URL (filters, ids, tabs, pages) is left alone. */
export const FEEDBACK_KEYS = [
  "saved",
  "error",
  "bulk",
  "deleted",
  "purged",
  "gift",
  "done",
  "restored",
  "removed",
  "added",
  "uploaded",
  "rejected",
  "result",
  "dismissed",
  "detail",
  "n",
  "f",
  "count",
  "items",
  "addr",
] as const;

const SAVED: Record<string, string> = {
  "1": "Saved",
  password: "Password changed",
  reset: "Reset link emailed",
  points: "Points adjusted",
  revoked: "Session revoked",
  pruned: "Old sign-in records removed",
  verified: "Mail server connected",
  sent: "Test email sent",
  backup: "Backup created",
  generated: "Barcodes generated",
  regenerated: "Barcodes regenerated",
  swept: "Translations updated",
  sweep: "Cart reminders checked",
  all: "Signed out of other sessions",
  address: "Address saved",
  featured: "Featured code saved",
  variations: "Variations generated",
};

const count = (value: string | null, one: string, many: string) => {
  const n = Number(value);
  return Number.isFinite(n) && value !== null && value !== "" ? `${n} ${n === 1 ? one : many}` : "";
};

export function describeFeedback(params: URLSearchParams): Feedback | null {
  if (params.get("error")) {
    return { tone: "bad", text: "Not saved - check the message on the page." };
  }

  const saved = params.get("saved");
  if (saved !== null) {
    if (saved === "off") return { tone: "warn", text: "Two-step verification turned off" };
    return { tone: "ok", text: SAVED[saved] ?? "Saved" };
  }

  const bulk = params.get("bulk");
  if (bulk) {
    const done: Record<string, string> = {
      deleted: "Deleted",
      status: "Status updated",
      reset: "Reset links sent",
      codes: "Codes generated",
    };
    return done[bulk]
      ? { tone: "ok", text: done[bulk] }
      : { tone: "bad", text: "Not done - check the message on the page." };
  }

  if (params.get("deleted")) return { tone: "ok", text: "Deleted" };
  if (params.get("purged")) return { tone: "ok", text: "Deleted permanently" };

  const gift = params.get("gift");
  if (gift === "added") return { tone: "ok", text: "Gift added" };
  if (gift === "removed") return { tone: "ok", text: "Gift removed" };

  if (params.has("done")) {
    const n = count(params.get("done"), "product", "products");
    return { tone: "ok", text: n ? `Applied to ${n}` : "Done" };
  }
  if (params.has("restored")) return { tone: "ok", text: "Prices restored" };
  if (params.has("removed")) return { tone: "ok", text: "Removed" };
  if (params.has("added")) return { tone: "ok", text: "Added" };

  if (params.has("uploaded")) {
    const rejected = Number(params.get("rejected")) || 0;
    return rejected
      ? { tone: "warn", text: `Uploaded, but ${rejected} ${rejected === 1 ? "file was" : "files were"} rejected` }
      : { tone: "ok", text: "Uploaded" };
  }

  const result = params.get("result");
  if (result) {
    const fine: Record<string, string> = {
      ok: "Saved and validated",
      saved: "Saved",
      webhook: "Webhook address updated",
      unlinked: "Unlinked",
    };
    return fine[result]
      ? { tone: "ok", text: fine[result] }
      : { tone: "warn", text: "Saved - check the message on the page." };
  }

  if (params.get("dismissed")) return { tone: "ok", text: "Dismissed" };

  return null;
}

/** The query string without any feedback flag, or "" when nothing else remains. */
export function stripFeedback(params: URLSearchParams): string {
  const next = new URLSearchParams(params);
  for (const key of FEEDBACK_KEYS) next.delete(key);
  return next.toString();
}
