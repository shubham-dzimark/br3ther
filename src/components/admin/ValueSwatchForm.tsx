"use client";

import { useState } from "react";
import { SwatchControl, type ValueRow } from "@/components/admin/AttributeValueEditor";
import type { AttributeDisplay } from "@/lib/attribute-display";

/**
 * Edits one saved value's swatch - the colour picker, the upload button or the
 * icon library, whichever its attribute asks for - and posts only that field
 * so switching an attribute's type later never blanks the other two.
 */
export function ValueSwatchForm({
  action,
  id,
  display,
  colour,
  imageUrl,
  icon,
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  display: AttributeDisplay;
  colour: string | null;
  imageUrl: string | null;
  icon: string | null;
}) {
  const [row, setRow] = useState<ValueRow>({
    value: "",
    colour: colour ?? "#000000",
    imageUrl: imageUrl ?? "",
    icon: icon ?? "",
  });

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {display === "COLOUR" ? <input type="hidden" name="colour" value={row.colour} /> : null}
      {display === "IMAGE" ? <input type="hidden" name="imageUrl" value={row.imageUrl} /> : null}
      {display === "ICON" ? <input type="hidden" name="icon" value={row.icon} /> : null}

      <SwatchControl
        display={display}
        row={row}
        onChange={(patch) => setRow((r) => ({ ...r, ...patch }))}
        compact
      />

      <button
        type="submit"
        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]"
      >
        Save
      </button>
    </form>
  );
}
