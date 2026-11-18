/*
 * The one decision the Sortly sync makes for each linked product option: what
 * the count should be now, and which side has to change to get there.
 *
 * Three numbers go in:
 *   base    - the count both systems last agreed on (null until first linked)
 *   sortly  - Sortly's quantity right now
 *   site    - the option's stock on the site right now
 * plus pendingDelta: sales, cancellations and gift lines the site has recorded
 * but not yet sent to Sortly. The site's stock already includes them.
 *
 * Rules (the user's choice: Sortly is the master count):
 *   - Recorded sales always reach Sortly as changes, never lost.
 *   - A change made in Sortly is copied to the site.
 *   - A hand edit on the site is copied to Sortly, unless Sortly also changed,
 *     in which case Sortly wins.
 *   - Counts never go below 0.
 *
 * Plain function, no imports, so it is tested on its own.
 */

export type MergeInput = {
  base: number | null;
  sortly: number;
  site: number;
  pendingDelta: number;
};

export type MergeKind = "first-link" | "none" | "deltas" | "sortly" | "site" | "conflict";

export type MergeDecision = {
  /** The count both systems should hold afterwards. */
  final: number;
  /** Whether Sortly has to be updated to `final`. */
  pushToSortly: boolean;
  /** How much to add to the site's stock (negative to take away). */
  siteAdjust: number;
  kind: MergeKind;
};

export function decideMerge({ base, sortly, site, pendingDelta }: MergeInput): MergeDecision {
  if (base === null) {
    // First link: Sortly's count is taken as it is.
    const final = Math.max(0, sortly);
    return { final, pushToSortly: final !== sortly, siteAdjust: final - site, kind: "first-link" };
  }

  const sortlyChange = sortly - base;
  const siteManual = site - (base + pendingDelta);

  let final: number;
  let kind: MergeKind;
  if (sortlyChange !== 0 && siteManual !== 0) {
    final = sortly + pendingDelta;
    kind = "conflict";
  } else if (sortlyChange !== 0) {
    final = sortly + pendingDelta;
    kind = "sortly";
  } else if (siteManual !== 0) {
    final = site;
    kind = "site";
  } else {
    final = sortly + pendingDelta;
    kind = pendingDelta !== 0 ? "deltas" : "none";
  }

  final = Math.max(0, final);
  return { final, pushToSortly: final !== sortly, siteAdjust: final - site, kind };
}
