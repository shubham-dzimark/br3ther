"use client";

import { useRef, useState } from "react";
import { Field, fieldInput } from "./Field";
import { slugify } from "@/lib/slug";

/**
 * Name + slug pair. The slug auto-fills from the name as you type, and stops
 * following it the moment you edit the slug yourself - so an existing product's
 * URL is never silently rewritten when its title is tweaked.
 */
export function NameSlugFields({
  defaultName = "",
  defaultSlug = "",
  /** Existing products already have a URL people may have linked to. */
  lockOnMount = false,
}: {
  defaultName?: string;
  defaultSlug?: string;
  lockOnMount?: boolean;
}) {
  const [name, setName] = useState(defaultName);
  const [slug, setSlug] = useState(defaultSlug);
  const manuallyEdited = useRef(lockOnMount && defaultSlug !== "");

  return (
    <>
      <Field label="Product name" htmlFor="name">
        <input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => {
            const next = e.target.value;
            setName(next);
            if (!manuallyEdited.current) setSlug(slugify(next));
          }}
          placeholder="Product name"
          className={fieldInput}
        />
      </Field>

      <Field label="Slug" htmlFor="slug">
        <input
          id="slug"
          name="slug"
          value={slug}
          onChange={(e) => {
            manuallyEdited.current = true;
            setSlug(e.target.value);
          }}
          onBlur={(e) => setSlug(slugify(e.target.value))}
          placeholder="auto-generated from the name"
          className={fieldInput}
        />
      </Field>

      <p className="-mt-4 px-5 text-xs text-slate-400 md:col-span-2">
        The product page lives at <code>/products/{slug || "your-slug"}</code>.
        {lockOnMount
          ? " Changing it breaks existing links and loses accumulated search ranking."
          : " It follows the name until you edit it yourself."}
      </p>
    </>
  );
}
