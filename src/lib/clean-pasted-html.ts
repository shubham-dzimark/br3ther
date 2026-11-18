import {
  ALLOWED_ATTRS,
  ALLOWED_STYLE_PATTERNS,
  ALLOWED_TAGS,
  SAFE_URL,
} from "@/lib/rich-text-allowlist";

/**
 * Clean HTML pasted into the editor, in the browser.
 *
 * Paste used to be flattened to plain text, which meant pasting a table gave
 * you its words in a row and nothing else. Keeping the markup means keeping
 * whatever came with it - Word's mso- styles, a site's tracking pixels, a
 * script tag - so it is walked and stripped against the same allowlist the
 * server uses.
 *
 * This is a convenience, not the security boundary. The server sanitises again
 * on save and that is what actually protects the shop; this exists so what you
 * paste is what you see.
 */
export function cleanPastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  walk(doc.body);
  return doc.body.innerHTML;
}

const TAGS = new Set(ALLOWED_TAGS);

function walk(node: Element) {
  // Snapshot: the list is live and we remove as we go.
  for (const child of [...node.children]) {
    const tag = child.tagName.toLowerCase();

    if (!TAGS.has(tag)) {
      /*
       * Unwrap rather than delete for layout tags, so pasting from a page
       * whose paragraphs sit inside <section> or <article> keeps the words.
       * Anything that could execute or fetch is removed outright.
       */
      if (/^(script|style|iframe|object|embed|link|meta|noscript|form|input|button|svg)$/.test(tag)) {
        child.remove();
        continue;
      }
      const parent = child.parentNode;
      while (child.firstChild) parent?.insertBefore(child.firstChild, child);
      child.remove();
      continue;
    }

    cleanAttributes(child, tag);
    walk(child);
  }
}

function cleanAttributes(el: Element, tag: string) {
  const allowed = new Set([...(ALLOWED_ATTRS[tag] ?? []), ...(ALLOWED_ATTRS["*"] ?? [])]);

  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();

    // Every on* handler, always, before anything else is considered.
    if (name.startsWith("on") || !allowed.has(name)) {
      el.removeAttribute(attr.name);
      continue;
    }

    if ((name === "href" || name === "src") && !SAFE_URL.test(attr.value.trim())) {
      el.removeAttribute(attr.name);
      continue;
    }

    if (name === "style") {
      const kept = attr.value
        .split(";")
        .map((d) => d.split(":"))
        .filter(([prop, ...rest]) => {
          const key = (prop ?? "").trim().toLowerCase();
          const value = rest.join(":").trim();
          const patterns = ALLOWED_STYLE_PATTERNS[key];
          return patterns ? patterns.some((p) => p.test(value)) : false;
        })
        .map(([prop, ...rest]) => `${prop.trim().toLowerCase()}:${rest.join(":").trim()}`)
        .join(";");

      if (kept) el.setAttribute("style", kept);
      else el.removeAttribute("style");
    }
  }
}
