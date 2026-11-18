"use client";

import { useState } from "react";

/** Copies a value a shopper has to retype into their banking app. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copybtn"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard blocked: the value is on screen to select by hand */
        }
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
