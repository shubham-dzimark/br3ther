/*
 * The rules for reordering the Categories list, kept apart from the component
 * so they can be tested on their own.
 *
 * The list is a one-level tree: top-level categories, each followed by its
 * sub-categories. Reordering keeps that tree intact:
 *  - a top-level category moves as a block, carrying its sub-categories;
 *  - a sub-category moves only among its siblings - putting it under another
 *    parent is a change of parent, which the edit form does;
 *  - a category whose parent no longer exists is treated as top level, so it
 *    can still be seen and moved.
 */

export type TreeRow = { id: string; parentId: string | null };

export type Tree = {
  /** Top-level ids, in order. */
  tops: string[];
  /** Each parent's sub-category ids, in order. */
  kids: Record<string, string[]>;
};

/** Which group a row moves in: its parent's id, or null for top level. */
export function groupOf(rows: Map<string, TreeRow>, row: TreeRow): string | null {
  return row.parentId && rows.has(row.parentId) ? row.parentId : null;
}

/** The tree from rows given in order. */
export function buildTree(list: TreeRow[]): Tree {
  const rows = new Map(list.map((r) => [r.id, r]));
  const tops: string[] = [];
  const kids: Record<string, string[]> = {};
  for (const r of list) {
    const g = groupOf(rows, r);
    if (g === null) tops.push(r.id);
    else (kids[g] ??= []).push(r.id);
  }
  return { tops, kids };
}

/** Every id, each parent followed by its sub-categories - the saved order. */
export function flatten(tree: Tree): string[] {
  return tree.tops.flatMap((id) => [id, ...(tree.kids[id] ?? [])]);
}

/** May `dragId` be dropped on `targetId`? */
export function canDrop(rows: Map<string, TreeRow>, dragId: string, targetId: string): boolean {
  if (dragId === targetId) return false;
  const row = rows.get(dragId);
  const target = rows.get(targetId);
  if (!row || !target) return false;
  const group = groupOf(rows, row);
  if (group === null) return (groupOf(rows, target) ?? target.id) !== dragId;
  return groupOf(rows, target) === group;
}

/**
 * `id` moved to where `targetId` stands, within their group. A top-level
 * category dropped on another block's sub-category lands at that block.
 * Anything not allowed returns the tree unchanged.
 */
export function moveTo(tree: Tree, rows: Map<string, TreeRow>, id: string, targetId: string): Tree {
  if (!canDrop(rows, id, targetId)) return tree;
  const row = rows.get(id)!;
  const target = rows.get(targetId)!;
  const group = groupOf(rows, row);
  if (group === null) {
    const targetTop = groupOf(rows, target) ?? target.id;
    return { ...tree, tops: reorder(tree.tops, id, targetTop) };
  }
  return { ...tree, kids: { ...tree.kids, [group]: reorder(tree.kids[group] ?? [], id, targetId) } };
}

/** `id` one place up (-1) or down (+1) among its siblings. */
export function step(tree: Tree, rows: Map<string, TreeRow>, id: string, by: -1 | 1): Tree {
  const row = rows.get(id);
  if (!row) return tree;
  const siblings = siblingsOf(tree, rows, id);
  const at = siblings.indexOf(id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= siblings.length) return tree;
  return moveTo(tree, rows, id, siblings[to]);
}

/** The ids `id` moves among. */
export function siblingsOf(tree: Tree, rows: Map<string, TreeRow>, id: string): string[] {
  const row = rows.get(id);
  if (!row) return [];
  const group = groupOf(rows, row);
  return group === null ? tree.tops : (tree.kids[group] ?? []);
}

/** `id` moved to where `targetId` stands, everything else in order. */
function reorder(list: string[], id: string, targetId: string): string[] {
  const from = list.indexOf(id);
  const to = list.indexOf(targetId);
  if (from < 0 || to < 0) return list;
  const next = [...list];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
