/**
 * Custom CSS entered in Settings, made safe to drop into a <style> element.
 *
 * The one thing that genuinely matters here: inside <style> the HTML parser
 * scans for the literal "</style", and nothing else ends the element. So a
 * CSS box that passes text through unchanged is not a styling hole, it is a
 * script-injection hole - `}</style><script>...` would run. Escaping that one
 * sequence closes it. Everything else in CSS is inert by comparison.
 *
 * Deliberately not a CSS validator: the point of the field is to override
 * anything, and a parser that only understood the properties we thought of
 * would get in the way. Invalid CSS is simply ignored by the browser.
 */

/** Enough for a heavy theme override; a guard against a runaway paste. */
export const MAX_CUSTOM_CSS = 100_000;

export function sanitizeCustomCss(raw: string | null | undefined): string {
  if (!raw) return "";

  return (
    raw
      .slice(0, MAX_CUSTOM_CSS)
      /*
       * "</style", in any spacing or casing the HTML parser would accept.
       * The backslash is a valid CSS escape inside a string, so legitimate
       * content:"</style>" still renders, while the parser no longer sees a
       * closing tag.
       */
      .replace(/<\s*\/\s*style/gi, String.raw`<\/style`)
      // A stray "<!--" opens an HTML comment that would swallow the rest of
      // the page in some parsing modes. Neutralised the same way.
      .replace(/<!--/g, String.raw`<\!--`)
  );
}
