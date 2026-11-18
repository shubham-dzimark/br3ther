"use client";

import { useMemo, useRef, useState } from "react";
import {
  ATTRIBUTE_DISPLAY_OPTIONS,
  displayOf,
  safeColour,
  type AttributeDisplay,
} from "@/lib/attribute-display";
import {
  ATTRIBUTE_ICON_GROUPS,
  iconGlyph,
  searchIcons,
} from "@/lib/attribute-icons";

/**
 * The controls for an attribute's values, used everywhere values are entered:
 * the Categories & attributes screen and the Add attribute box on a product.
 *
 * Values used to be typed as "Black:#000000" or "Oak|/uploads/oak.png", which
 * only someone who had read the hint could do. Here a colour has a colour
 * picker, a picture has an upload button, and an icon is chosen from the
 * shop's own set - so the same three choices exist on every screen.
 */

const PRESET_COLOURS = [
  "#000000", "#FFFFFF", "#EF4444", "#F97316", "#F59E0B", "#EAB308",
  "#84CC16", "#22C55E", "#10B981", "#14B8A6", "#06B6D4", "#3B82F6",
  "#6366F1", "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F43F5E",
  "#78716C", "#A8A29E", "#D6D3D1", "#7C2D12", "#1E3A8A", "#064E3B",
];

export type ValueRow = {
  value: string;
  colour: string;
  imageUrl: string;
  icon: string;
};

export const emptyRow = (): ValueRow => ({ value: "", colour: "#000000", imageUrl: "", icon: "" });

const pill =
  "rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]";

/** A round preview of whatever swatch a value carries. */
export function SwatchPreview({
  display,
  row,
  size = 28,
}: {
  display: AttributeDisplay | string | null | undefined;
  row: { colour?: string | null; imageUrl?: string | null; icon?: string | null };
  size?: number;
}) {
  const mode = displayOf(display);
  const style = { width: size, height: size } as const;

  if (mode === "COLOUR") {
    return (
      <span
        aria-hidden="true"
        className="inline-block shrink-0 rounded-full border border-slate-300"
        style={{ ...style, backgroundColor: safeColour(row.colour) ?? "#FFFFFF" }}
      />
    );
  }
  if (mode === "IMAGE" && row.imageUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={row.imageUrl}
        alt=""
        className="shrink-0 rounded-lg border border-slate-200 object-cover"
        style={style}
      />
    );
  }
  if (mode === "ICON" && row.icon) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center"
        style={{ ...style, fontSize: Math.round(size * 0.78), lineHeight: 1 }}
      >
        {iconGlyph(row.icon)}
      </span>
    );
  }
  return null;
}

/** Search-as-you-type grid of the shop's icons. */
export function IconPicker({
  value,
  onPick,
  onClose,
}: {
  value: string;
  onPick: (id: string) => void;
  onClose?: () => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchIcons(query), [query]);
  const groups = query
    ? [{ name: "Matches", icons: results }]
    : ATTRIBUTE_ICON_GROUPS;

  return (
    <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons - mango, berry, sour, size…"
          aria-label="Search icons"
          className="min-w-0 flex-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[var(--admin-accent)]"
        />
        {onClose ? (
          <button type="button" onClick={onClose} className={pill}>
            Done
          </button>
        ) : null}
      </div>
      <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
        {groups.map((group) => (
          <div key={group.name}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {group.name}
            </p>
            <div className="flex flex-wrap gap-1">
              {group.icons.map((icon) => (
                <button
                  key={icon.id}
                  type="button"
                  onClick={() => onPick(icon.id)}
                  title={icon.label}
                  aria-label={icon.label}
                  aria-pressed={value === icon.id}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border text-lg transition ${
                    value === icon.id
                      ? "border-[var(--admin-accent)] bg-[var(--admin-accent)]/10"
                      : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span aria-hidden="true">{icon.glyph}</span>
                </button>
              ))}
            </div>
            {group.icons.length === 0 ? (
              <p className="text-xs text-slate-400">Nothing matches that.</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Uploads one picture and hands back the URL it was stored at. */
async function uploadSwatch(file: File): Promise<string | null> {
  const body = new FormData();
  body.append("files", file);
  const res = await fetch("/api/admin/media", { method: "POST", body });
  if (!res.ok) return null;
  const data = (await res.json()) as { uploaded?: { url: string }[] };
  return data.uploaded?.[0]?.url ?? null;
}

/** The one control a value needs, decided by how the attribute is shown. */
export function SwatchControl({
  display,
  row,
  onChange,
  compact = false,
}: {
  display: AttributeDisplay;
  row: ValueRow;
  onChange: (patch: Partial<ValueRow>) => void;
  compact?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (display === "COLOUR") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          value={safeColour(row.colour) ?? "#000000"}
          onChange={(e) => onChange({ colour: e.target.value })}
          aria-label="Pick the colour"
          className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5"
        />
        <input
          value={row.colour}
          onChange={(e) => onChange({ colour: e.target.value })}
          placeholder="#000000"
          aria-label="Colour code"
          className="w-24 rounded-full border border-slate-200 px-3 py-1.5 text-xs uppercase outline-none focus:border-[var(--admin-accent)]"
        />
        {!compact ? (
          <div className="flex flex-wrap gap-1">
            {PRESET_COLOURS.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => onChange({ colour: hex })}
                title={hex}
                aria-label={hex}
                className={`h-5 w-5 rounded-full border ${
                  (safeColour(row.colour) ?? "") === hex
                    ? "border-slate-900 ring-2 ring-slate-900/20"
                    : "border-slate-300"
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (display === "IMAGE") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {/* No thumbnail here: the row already shows the swatch. */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            const url = await uploadSwatch(file);
            setBusy(false);
            if (url) onChange({ imageUrl: url });
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={pill}>
          {busy ? "Uploading…" : row.imageUrl ? "Replace" : "Upload"}
        </button>
        {row.imageUrl ? (
          <button type="button" onClick={() => onChange({ imageUrl: "" })} className={pill}>
            Remove
          </button>
        ) : null}
        <input
          value={row.imageUrl}
          onChange={(e) => onChange({ imageUrl: e.target.value })}
          placeholder="or paste /uploads/oak.png"
          aria-label="Picture address"
          className="min-w-0 flex-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[var(--admin-accent)]"
        />
      </div>
    );
  }

  if (display === "ICON") {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {/* No second glyph: the row already shows the icon. */}
          <button type="button" onClick={() => setPicking((v) => !v)} className={pill}>
            {picking ? "Close icons" : row.icon ? "Change icon" : "Choose icon"}
          </button>
          {row.icon ? (
            <button type="button" onClick={() => onChange({ icon: "" })} className={pill}>
              Clear
            </button>
          ) : null}
        </div>
        {picking ? (
          <IconPicker
            value={row.icon}
            onPick={(id) => {
              onChange({ icon: id });
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        ) : null}
      </div>
    );
  }

  return <p className="text-xs text-slate-500">Shoppers see the name as typed.</p>;
}

/**
 * Rows of values with their swatches, posted as JSON in one hidden field so
 * nothing has to be parsed out of a comma-separated line.
 */
export function AttributeValueRows({
  display,
  name = "valuesJson",
  initial,
  label = "Values",
  rows: controlled,
  onRowsChange,
}: {
  display: AttributeDisplay;
  /** Omit to post nothing - used when a parent sends the rows itself. */
  name?: string;
  initial?: ValueRow[];
  label?: string;
  /** Controlled mode, for the product editor which posts JSON over fetch. */
  rows?: ValueRow[];
  onRowsChange?: (rows: ValueRow[]) => void;
}) {
  const [own, setOwn] = useState<ValueRow[]>(initial ?? [emptyRow()]);
  const rows = controlled ?? own;
  const setRows = (fn: (list: ValueRow[]) => ValueRow[]) => {
    const next = fn(rows);
    if (onRowsChange) onRowsChange(next);
    else setOwn(next);
  };

  const update = (i: number, patch: Partial<ValueRow>) =>
    setRows((list) => list.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const filled = rows.filter((r) => r.value.trim());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <button type="button" onClick={() => setRows((l) => [...l, emptyRow()])} className={pill}>
          Add another value
        </button>
      </div>

      {/*
       * Text values line up across the row - typing S, M, L should look like
       * three boxes on one line, not a stack. Values with a swatch keep a card
       * each, since a colour picker or an icon grid needs the width.
       */}
      <div className={display === "TEXT" ? "flex flex-wrap gap-2" : "space-y-3"}>
        {rows.map((row, i) => (
          <div
            key={i}
            className={
              display === "TEXT"
                ? "flex items-center gap-1.5"
                : "rounded-2xl border border-slate-200 p-3"
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <SwatchPreview display={display} row={row} />
              <input
                value={row.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="Name, e.g. Mango"
                aria-label={`Value ${i + 1} name`}
                className={`min-w-0 rounded-full border border-slate-200 px-4 py-2 text-sm outline-none focus:border-[var(--admin-accent)] ${
                  display === "TEXT" ? "w-40" : "flex-1"
                }`}
              />
              {rows.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setRows((l) => l.filter((_, n) => n !== i))}
                  className={display === "TEXT" ? "text-xs text-slate-400 hover:text-red-600" : pill}
                  aria-label={`Remove value ${i + 1}`}
                >
                  {display === "TEXT" ? "\u00d7" : "Remove"}
                </button>
              ) : null}
            </div>
            {display !== "TEXT" ? (
              <div className="mt-2 pl-1">
                <SwatchControl display={display} row={row} onChange={(patch) => update(i, patch)} />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* What the server reads. Names are trimmed on the way in as well. */}
      {name ? <input type="hidden" name={name} value={JSON.stringify(filled)} /> : null}
    </div>
  );
}

/**
 * Display type + its values together, for a form that creates an attribute -
 * the two have to move as one, since the type decides which control a value
 * gets.
 */
export function NewAttributeFields({
  displayName = "display",
  valuesName = "valuesJson",
}: {
  displayName?: string;
  valuesName?: string;
}) {
  const [display, setDisplay] = useState<AttributeDisplay>("TEXT");

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="attr-display" className="mb-1 block text-sm font-medium text-slate-700">
          Show values as
        </label>
        <select
          id="attr-display"
          name={displayName}
          value={display}
          onChange={(e) => setDisplay(e.target.value as AttributeDisplay)}
          className="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 outline-none focus:border-[var(--admin-accent)]"
        >
          {ATTRIBUTE_DISPLAY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <AttributeValueRows display={display} name={valuesName} />
    </div>
  );
}
