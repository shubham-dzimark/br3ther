/**
 * What a product description may contain.
 *
 * Deliberately in its own file with no "server-only": the editor cleans pasted
 * markup in the browser and the server cleans it again on save, and the two
 * must agree. Two hand-maintained copies of an allowlist drift apart the first
 * time only one of them is edited - and the one that drifts is the one that
 * silently starts throwing away a customer's table.
 *
 * The server is the authority. The browser copy is a convenience so what you
 * paste is what you see.
 */

export const ALLOWED_TAGS = [
  "p", "br", "hr",
  "strong", "b", "em", "i", "u", "s", "sub", "sup",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "a", "code", "pre",
  "span", "div",
  // Tables: pasting one from a spreadsheet or another page is the single most
  // common thing a shop owner does with a description.
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "img", "figure", "figcaption",
];

/** Attributes each tag may keep. Everything else is dropped. */
export const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href", "title", "target", "rel"],
  th: ["colspan", "rowspan", "scope"],
  td: ["colspan", "rowspan"],
  col: ["span"],
  colgroup: ["span"],
  table: ["border"],
  /*
   * class on the structural wrappers only. The editor marks its own table and
   * image figures with one ("figure.table", "figure.image"), and stripping it
   * meant that on the next edit the editor no longer recognised the figure it
   * had written - so it wrapped the table in a fresh one, every save, leaving
   * the previous caption stranded outside. Values are checked below.
   */
  figure: ["class"],
  figcaption: ["class"],
  img: ["src", "alt", "title", "width", "height", "loading", "class"],
  "*": ["style"],
};

/**
 * The class names those wrappers may keep: the editor's own structural ones,
 * nothing else. A class cannot execute anything, but an open list would let
 * pasted markup borrow the shop's styles and pretend to be part of the page.
 */
export const ALLOWED_CLASSES: Record<string, (string | RegExp)[]> = {
  figure: ["table", "image", "media", /^image-style-[\w-]{1,30}$/, "image_resized"],
  figcaption: ["table", "image"],
  img: ["image_resized"],
};

/**
 * CSS properties, each matched against a value pattern rather than merely
 * named. That is what keeps url(), expression() and position:fixed out - the
 * usual routes by which a style attribute becomes code execution or an overlay
 * on top of the page.
 */
/** hex, rgb(), rgba(), hsl(), hsla() and the CSS colour keywords. */
const COLOUR_PATTERNS: RegExp[] = [
  /^#[0-9a-f]{3,8}$/i,
  /^rgba?\(\s*\d{1,3}\s*[,\s]\s*\d{1,3}\s*[,\s]\s*\d{1,3}\s*([,/]\s*(0|1|0?\.\d+|\d{1,3}%)\s*)?\)$/i,
  /^hsla?\(\s*\d{1,3}(\.\d+)?(deg)?\s*[,\s]\s*\d{1,3}(\.\d+)?%\s*[,\s]\s*\d{1,3}(\.\d+)?%\s*([,/]\s*(0|1|0?\.\d+|\d{1,3}%)\s*)?\)$/i,
  /^[a-z]{3,20}$/i,
];

export const ALLOWED_STYLE_PATTERNS: Record<string, RegExp[]> = {
  /*
   * Every notation a colour picker writes, not just the two a hand-typed
   * style tends to use: the editor's own picker emits hsl(), and a colour
   * pasted from another page is as likely to be rgba() or a named colour.
   * Anything that did not match was silently dropped on save, which looked
   * like "the colour will not stick".
   */
  color: [...COLOUR_PATTERNS],
  "background-color": [...COLOUR_PATTERNS, /^transparent$/i],
  "font-size": [
    /^\d{1,3}(\.\d+)?(px|pt|rem|em|%)$/i,
    /^(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large)$/i,
  ],
  "font-family": [/^[\w\s"',-]{1,80}$/],
  "font-weight": [/^(normal|bold|[1-9]00)$/i],
  "font-style": [/^(normal|italic)$/i],
  "text-align": [/^(left|right|center|justify)$/i],
  "text-decoration": [/^(none|underline|line-through)$/i],
  width: [/^\d{1,3}(\.\d+)?(px|%|em|rem)$/i],
  height: [/^\d{1,4}(\.\d+)?(px|%|em|rem)$/i],
  "border-collapse": [/^(collapse|separate)$/i],
  "vertical-align": [/^(top|middle|bottom|baseline)$/i],
  padding: [/^[\d.]{1,6}(px|em|rem)( [\d.]{1,6}(px|em|rem)){0,3}$/i],
};

/** Link and image sources we will follow. Notably not javascript: or data:. */
export const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i;
