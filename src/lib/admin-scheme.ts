/*
 * The admin's light / dark choice, remembered per browser in a cookie so the
 * server can render the right scheme on the first byte (no flash).
 *
 * "auto" follows the operating system; it is resolved on the client by the
 * inline script in the admin layout before the first paint.
 */
export const ADMIN_SCHEME_COOKIE = "br3thr_admin_scheme";

export type AdminSchemePref = "light" | "dark" | "auto";

export function parseSchemePref(value: string | undefined | null): AdminSchemePref {
  return value === "light" || value === "dark" ? value : "auto";
}

/*
 * Runs inline as the first child of the admin root, before anything paints.
 * With "auto" it reads the OS setting and keeps following it if it changes.
 * Kept tiny and dependency-free on purpose.
 */
export const SCHEME_BOOT_SCRIPT = `(function(){var r=document.currentScript&&document.currentScript.parentElement;if(!r||r.getAttribute("data-scheme-pref")!=="auto")return;var m=window.matchMedia("(prefers-color-scheme: dark)");var s=function(){if(r.getAttribute("data-scheme-pref")==="auto")r.setAttribute("data-scheme",m.matches?"dark":"light")};s();m.addEventListener&&m.addEventListener("change",s)})();`;
