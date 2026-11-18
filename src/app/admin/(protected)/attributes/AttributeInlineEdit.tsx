"use client";

import { useState } from "react";
import { IconPencil, IconTrash } from "@/components/admin/Icons";
import { deleteAttribute, deleteAttributeValue, renameAttribute, renameAttributeValue } from "./actions";

/** Attribute heading - click the pencil to rename in place. */
export function AttributeHeading({
  id,
  name,
  slug,
  valueCount,
}: {
  id: string;
  name: string;
  slug: string;
  valueCount: number;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <form action={renameAttribute} className="flex flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <input
          name="name"
          defaultValue={name}
          required
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          className="min-w-0 flex-1 rounded-lg border border-[var(--admin-accent)] px-3 py-1.5 text-lg font-semibold text-slate-900 outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-[var(--admin-btn)] px-3.5 py-2 text-sm font-medium text-[var(--admin-btn-ink)] transition hover:bg-[var(--admin-btn)]"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100"
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="truncate text-lg font-semibold text-slate-900">{name}</h2>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Rename ${name}`}
            title="Rename"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-[var(--admin-accent)]"
          >
            <IconPencil className="h-[15px] w-[15px]" />
          </button>
        </div>
        <p className="text-xs text-slate-400">
          /{slug} &middot; {valueCount} value{valueCount === 1 ? "" : "s"}
        </p>
      </div>
      <form action={deleteAttribute}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          aria-label={`Delete ${name}`}
          title="Delete attribute"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
        >
          <IconTrash className="h-[17px] w-[17px]" />
        </button>
      </form>
    </>
  );
}

/** Value chip - click the label to rename, the cross to delete. */
export function AttributeValueChip({ id, value }: { id: string; value: string }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <form action={renameAttributeValue} className="flex items-center gap-1">
        <input type="hidden" name="id" value={id} />
        <input
          name="value"
          defaultValue={value}
          required
          autoFocus
          size={Math.max(value.length + 2, 6)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          className="min-w-0 rounded-full border border-[var(--admin-accent)] px-3 py-1 text-sm text-slate-900 outline-none"
        />
        <button
          type="submit"
          className="rounded-full bg-[var(--admin-btn)] px-3 py-1 text-xs font-medium text-[var(--admin-btn-ink)] transition hover:bg-[var(--admin-btn)]"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-full px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100"
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1.5 text-sm text-slate-700">
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Rename value"
        className="rounded transition hover:text-[var(--admin-accent)]"
      >
        {value}
      </button>
      <form action={deleteAttributeValue} className="flex">
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          aria-label={`Remove ${value}`}
          title="Remove value"
          className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-100 hover:text-red-600"
        >
          &times;
        </button>
      </form>
    </span>
  );
}
