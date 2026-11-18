import "server-only";
import sanitizeHtml from "sanitize-html";
import {
  ALLOWED_ATTRS,
  ALLOWED_CLASSES,
  ALLOWED_STYLE_PATTERNS,
  ALLOWED_TAGS,
} from "@/lib/rich-text-allowlist";

/**
 * Sanitising HTML written in the admin's rich-text editor.
 *
 * Product descriptions used to be plain text, rendered with whitespace-pre-line
 * - so nothing in them could ever execute. Storing HTML changes that: whatever
 * is saved here is injected into a public product page, which makes this the
 * one place standing between a pasted <script> and stored XSS on the shop.
 *
 * So it is an allowlist, and a deliberately short one. Anything not named
 * below is stripped, including every event handler, every style attribute and
 * every tag that can load or run something. A library does the parsing rather
 * than a regular expression: HTML is not a regular language, and hand-rolled
 * "strip the tags" passes are defeated by malformed markup on purpose.
 */

const SHARED: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRS,
  allowedClasses: ALLOWED_CLASSES,
  allowedStyles: { "*": ALLOWED_STYLE_PATTERNS },
  // http(s), mail and phone only. Notably NOT javascript:, and not data:,
  // which is the usual way a "harmless" link becomes script execution.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  // Anything not on the list is dropped entirely, contents and all, rather
  // than having its tags peeled off and its text kept.
  nonTextTags: ["style", "script", "textarea", "option", "noscript", "iframe"],
  /*
   * An <img> whose src was rejected is left behind as a bare tag, which the
   * browser draws as a broken-image icon - a security win that looks like a
   * bug on the product page. Drop it instead.
   */
  exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  transformTags: {
    // A link that opens a new tab must not hand the opener to the target.
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.target
        ? { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" }
        : attribs,
    }),
    // Browsers emit a bare <font> for colour and face; convert it so the
    // style pipeline above is the only route those properties can take.
    font: (tagName, attribs) => {
      const style: string[] = [];
      if (attribs.color) style.push(`color:${attribs.color}`);
      if (attribs.face) style.push(`font-family:${attribs.face}`);
      const attrs: Record<string, string> = {};
      if (style.length) attrs.style = style.join(";");
      return { tagName: "span", attribs: attrs };
    },
  },
};

/** Full product description: the whole toolbar. */
/**
 * Collapse figures that only wrap another figure, and drop the caption each
 * discarded wrapper left behind.
 *
 * Content saved while the editor's own class was being stripped grew one
 * wrapper per save, with the previous caption stranded between the closing
 * tags. Healing it here means an old product is put right the next time it is
 * saved, rather than needing every description rewritten by hand. Runs before
 * sanitising, so the sanitiser rebalances whatever this leaves.
 */
function unwrapNestedFigures(html: string): string {
  let out = html;
  let previous = "";
  while (out !== previous) {
    previous = out;
    out = out
      .replace(/<figure(?:\s[^>]*)?>\s*(<figure)/gi, "$1")
      .replace(/<\/figure>\s*<figcaption[^>]*>[\s\S]*?<\/figcaption>\s*<\/figure>/gi, "</figure>");
  }
  return out;
}

export function sanitizeRichText(html: string): string {
  if (!html) return "";
  const clean = sanitizeHtml(unwrapNestedFigures(html), SHARED);
  return hasContent(clean) ? clean.trim() : "";
}

/**
 * Does this actually say anything?
 *
 * An empty editor still posts markup - a stray <p><br></p> - and storing that
 * as a description means the storefront renders an empty block. But "has text"
 * alone is the wrong test: a description that is just a photo, or just a size
 * table, carries no text at all and was being thrown away as blank.
 */
function hasContent(html: string): boolean {
  if (sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).trim()) return true;
  return /<(img|table|hr)\b/i.test(html);
}

/**
 * Short description: the same rules minus block structure.
 *
 * It is shown on listing cards, in search results and in meta tags, where a
 * heading or a bullet list would break the layout rather than help.
 */
export function sanitizeShortText(html: string): string {
  if (!html) return "";
  // Block structure is dropped here, so its boundaries become spaces first.
  const clean = sanitizeHtml(spaceBlocks(html), {
    ...SHARED,
    allowedTags: ["strong", "b", "em", "i", "u", "s", "a", "br", "span"],
  });
  const tidy = clean.replace(/\s{2,}/g, " ").trim();
  return sanitizeHtml(tidy, { allowedTags: [], allowedAttributes: {} }).trim() ? tidy : "";
}

/**
 * Turn the end of every block into a space.
 *
 * Stripping tags without this welds the last word of one block to the first of
 * the next - "…Fit</h2><p>Made from…" becomes "FitMade from", which is what a
 * search engine would then show as the page description.
 */
function spaceBlocks(html: string): string {
  return html.replace(
    /<\/(p|h[1-6]|li|ul|ol|div|blockquote|pre|td|th|tr|caption|figcaption)>|<br\s*\/?>/gi,
    " ",
  );
}

/**
 * The words with no markup, for anywhere HTML would be wrong: meta
 * descriptions, the chat assistant's tool output, CSV exports.
 */
export function richTextToPlain(html: string): string {
  return sanitizeHtml(spaceBlocks(html), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
