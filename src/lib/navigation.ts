import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Storefront navigation, editable in the admin.
 *
 * The header used to hard-code Shop / categories / Sale / Reviews / Refer a
 * friend. This reads a saved menu instead, and falls back to that original set
 * when no menu has been configured - so a fresh install still has usable
 * navigation rather than an empty bar.
 */

export type NavNode = {
  id: string;
  label: string;
  url: string;
  newTab: boolean;
  children: NavNode[];
};

export type NavLocation = "header" | "footer";

export async function getNavigation(
  location: NavLocation = "header",
): Promise<NavNode[]> {
  const items = await prisma.navItem.findMany({
    where: { isActive: true, location },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, label: true, url: true, newTab: true, parentId: true },
  });

  if (items.length === 0) return [];

  const byId = new Map(
    items.map((i) => [i.id, { ...i, children: [] as NavNode[] }]),
  );
  const roots: NavNode[] = [];

  for (const item of items) {
    const node = byId.get(item.id)!;
    // A child whose parent is inactive or missing is promoted rather than
    // dropped, so switching a parent off never hides its children silently.
    const parent = item.parentId ? byId.get(item.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots.map(strip);
}

function strip(n: {
  id: string;
  label: string;
  url: string;
  newTab: boolean;
  children: NavNode[];
}): NavNode {
  return {
    id: n.id,
    label: n.label,
    url: n.url,
    newTab: n.newTab,
    children: n.children.map(strip),
  };
}

/** Everything the admin editor needs, including inactive items. */
export async function getNavigationForAdmin(location: NavLocation = "header") {
  return prisma.navItem.findMany({
    where: { location },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      url: true,
      parentId: true,
      sortOrder: true,
      isActive: true,
      newTab: true,
    },
  });
}

export type MenuRow = {
  label: string;
  url: string;
  depth: 0 | 1;
  isActive: boolean;
  newTab: boolean;
};

/**
 * Turn the editor's posted JSON into clean rows. Returns null when the field
 * is not a JSON array at all, so the caller can report a bad submission
 * rather than silently emptying the menu.
 */
export function parseMenuRows(raw: unknown): MenuRow[] | null {
  let rows: unknown;
  try {
    rows = JSON.parse(String(raw ?? "[]"));
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;

  return rows
    .map((r) => ({
      label: String(r?.label ?? "").trim().slice(0, 60),
      url: String(r?.url ?? "").trim().slice(0, 300),
      depth: (r?.depth === 1 ? 1 : 0) as 0 | 1,
      isActive: r?.isActive !== false,
      newTab: r?.newTab === true,
    }))
    .map((r) => ({ ...r, url: normalizeMenuUrl(r.url) }))
    // A row without both a label and a usable link would render as an empty gap.
    .filter((r) => r.label && r.url);
}

/**
 * Turns what people type into a link that works, instead of the row being
 * dropped on save: "reviews" -> "/reviews", "br3thr.com/reviews" ->
 * "/reviews", "instagram.com/x" -> "https://instagram.com/x". Returns "" for
 * anything unsafe (javascript:, data: and other schemes).
 */
export function normalizeMenuUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  if (/^\/(?!\/)/.test(url)) return url;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return url;
  // Any other scheme is refused outright.
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return "";
  if (url.startsWith("//")) return `https:${url}`;
  const host = /^(www\.)?([a-z0-9-]+(\.[a-z0-9-]+)+)(?=\/|\?|#|$)/i.exec(url);
  if (host) {
    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/.*$/, "").toLowerCase();
    // The shop's own address becomes a plain path, so it also works on a staging copy.
    if (site && host[2].toLowerCase() === site) return url.slice(host[0].length) || "/";
    return `https://${url}`;
  }
  return `/${url.replace(/^\.?\/+/, "")}`;
}

/**
 * Replace one menu in one go.
 *
 * The editor posts a flat ordered list with a depth per row; parent links are
 * derived here (a depth-1 row belongs to the nearest depth-0 row above it), so
 * ordering and nesting can't drift apart. Rewriting the rows wholesale is
 * simpler than diffing and a menu is a handful of rows. Shared by the
 * Navigation page and the Footer page, which embeds the footer menu.
 */
export async function replaceMenu(location: NavLocation, rows: MenuRow[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Scoped to this menu - wiping the table would take the other one with it.
    await tx.navItem.deleteMany({ where: { location } });

    let currentParentId: string | null = null;
    let order = 0;

    for (const row of rows) {
      const data = {
        label: row.label,
        url: row.url,
        sortOrder: order++,
        isActive: row.isActive,
        newTab: row.newTab,
        location,
      };
      if (row.depth === 0) {
        const created = await tx.navItem.create({
          data: { ...data, parentId: null },
          select: { id: true },
        });
        currentParentId = created.id;
      } else {
        // A depth-1 row with nothing above it becomes top-level rather than
        // being dropped.
        await tx.navItem.create({ data: { ...data, parentId: currentParentId } });
      }
    }
  });
}
