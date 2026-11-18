"use client";

import { useState } from "react";

/**
 * Drag-to-reorder wrapper for the homepage section cards.
 *
 * The cards themselves stay server-rendered: this only owns the order, and
 * publishes it through a hidden input so it saves with the same form as every
 * other field. Reordering and editing in one save is the whole point - two
 * separate saves would let someone drag a card, edit a heading, press Save and
 * silently lose one of the two.
 *
 * Native HTML5 drag and drop rather than a library: it is a list of eleven
 * rows, and a drag library would be a dependency for one screen.
 *
 * Keyboard users are not left out - each row has Move up / Move down buttons,
 * which is also what makes this usable on a touch screen, where HTML5 drag
 * events do not fire at all.
 */
export function SortableSections({
  name,
  initialOrder,
  cards,
}: {
  name: string;
  initialOrder: string[];
  /** One entry per section, keyed to match `initialOrder`. */
  cards: { key: string; label: string; node: React.ReactNode }[];
}) {
  const [order, setOrder] = useState(initialOrder);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const byKey = new Map(cards.map((c) => [c.key, c]));
  const rows = order.map((k) => byKey.get(k)).filter(Boolean) as typeof cards;

  const move = (key: string, to: number) => {
    setOrder((prev) => {
      const from = prev.indexOf(key);
      if (from < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(Math.max(0, Math.min(next.length, to)), 0, key);
      return next;
    });
  };

  return (
    <>
      <input type="hidden" name={name} value={order.join(",")} />

      <div className="space-y-5">
        {rows.map((card, i) => {
          const isDragging = dragging === card.key;
          const isOver = over === card.key && dragging !== card.key;

          return (
            <div
              key={card.key}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(card.key);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && dragging !== card.key) move(dragging, i);
                setDragging(null);
                setOver(null);
              }}
              className={`rounded-[var(--admin-radius)] transition ${
                isDragging ? "opacity-50" : ""
              } ${isOver ? "ring-2 ring-[var(--admin-accent)] ring-offset-2" : ""}`}
            >
              <div className="mb-2 flex items-center gap-2">
                {/* Only the handle is draggable, so selecting text inside a
                    card does not start a drag. */}
                <span
                  draggable
                  onDragStart={(e) => {
                    setDragging(card.key);
                    e.dataTransfer.effectAllowed = "move";
                    /* Firefox refuses to start a drag without payload. */
                    e.dataTransfer.setData("text/plain", card.key);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  title="Drag to reorder"
                  aria-hidden="true"
                  className="flex h-8 w-8 cursor-grab items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 active:cursor-grabbing"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                    <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                    <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
                  </svg>
                </span>

                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {i + 1} · {card.label}
                </span>

                <span className="ml-auto flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(card.key, i - 1)}
                    disabled={i === 0}
                    aria-label={`Move ${card.label} up`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:text-[var(--admin-accent)] disabled:opacity-35"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m6 15 6-6 6 6" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => move(card.key, i + 1)}
                    disabled={i === rows.length - 1}
                    aria-label={`Move ${card.label} down`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:text-[var(--admin-accent)] disabled:opacity-35"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </span>
              </div>

              {card.node}
            </div>
          );
        })}
      </div>
    </>
  );
}
