/**
 * How an attribute's values are shown to shoppers.
 *
 * WooCommerce leaves this to a swatches plugin; here it is part of the
 * attribute itself, so the storefront and the admin agree without a mapping
 * table. TEXT is the safe default: a value with no colour or picture set still
 * renders as its own label rather than an empty box.
 */
export type AttributeDisplay = "TEXT" | "COLOUR" | "IMAGE" | "ICON";

export const ATTRIBUTE_DISPLAY_OPTIONS = [
  { value: "TEXT", label: "Text - the value's name" },
  { value: "COLOUR", label: "Colour - a colour circle" },
  { value: "IMAGE", label: "Image - a picture you upload" },
  { value: "ICON", label: "Icon - pick from the icon library" },
] as const;

export const displayOf = (raw: string | null | undefined): AttributeDisplay =>
  raw === "COLOUR" || raw === "IMAGE" || raw === "ICON" ? raw : "TEXT";

/** #rrggbb only, so a stray value cannot reach a style attribute. */
export function safeColour(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null;
}

/** One value on its way in from a form: the name plus whatever swatch it has. */
export type ValueSpec = {
  value: string;
  colour: string | null;
  image: string | null;
  icon: string | null;
};

/**
 * "Black:#000000", "Black|https://...", "Mango>mango" - the shorthand a value
 * can still be typed in with. The pickers post JSON instead, so this is the
 * fallback for someone typing a list by hand; anything it cannot read becomes
 * the value's name, which is never wrong, only plain.
 */
export function parseValueSpec(raw: string): ValueSpec {
  const text = raw.trim();
  const colonHex = text.match(/^(.*?)\s*:\s*(#[0-9a-fA-F]{6})$/);
  if (colonHex)
    return { value: colonHex[1].trim(), colour: colonHex[2].toUpperCase(), image: null, icon: null };

  const pipeUrl = text.match(/^(.*?)\s*\|\s*(https?:\/\/\S+|\/\S+)$/);
  if (pipeUrl) return { value: pipeUrl[1].trim(), colour: null, image: pipeUrl[2], icon: null };

  const arrowIcon = text.match(/^(.*?)\s*>\s*([a-z0-9-]+)$/i);
  if (arrowIcon)
    return { value: arrowIcon[1].trim(), colour: null, image: null, icon: arrowIcon[2].toLowerCase() };

  return { value: text, colour: null, image: null, icon: null };
}

/**
 * The values a picker posted, as JSON, with every field checked before it goes
 * anywhere near the database. Falls back to the typed shorthand when the field
 * is absent, so both paths end in the same shape.
 */
export function readValueSpecs(json: string | null | undefined, typed?: string | null): ValueSpec[] {
  const out: ValueSpec[] = [];
  if (json) {
    try {
      const parsed: unknown = JSON.parse(json);
      if (Array.isArray(parsed)) {
        for (const row of parsed) {
          if (!row || typeof row !== "object") continue;
          const r = row as Record<string, unknown>;
          const value = String(r.value ?? "").trim().slice(0, 60);
          if (!value) continue;
          out.push({
            value,
            colour: safeColour(typeof r.colour === "string" ? r.colour : null),
            image: safeSwatchImage(typeof r.imageUrl === "string" ? r.imageUrl : null),
            icon: typeof r.icon === "string" && /^[a-z0-9-]{1,40}$/.test(r.icon) ? r.icon : null,
          });
        }
        return out;
      }
    } catch {
      // Fall through to the typed list rather than losing what was entered.
    }
  }
  return (typed ?? "")
    .split(",")
    .map((part) => parseValueSpec(part))
    .filter((v) => v.value);
}

/**
 * A swatch picture must be one of ours - an upload path or a URL on this site.
 * Anything else is dropped: the admin should not be able to hotlink a tracker
 * into every product page by pasting a URL.
 */
export function safeSwatchImage(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (v.startsWith("/")) return v.slice(0, 400);
  if (/^https?:\/\/[^\s]+$/.test(v)) return v.slice(0, 400);
  return null;
}
