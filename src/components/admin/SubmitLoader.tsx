"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/*
 * A spinner on every admin Save / Update / Delete button while it works.
 *
 * Mounted once in the admin layout rather than added to 165 buttons: on submit
 * the button that was pressed gets `data-nl-loading` (a CSS spinner, and it
 * stops taking clicks, so a slow save cannot be sent twice). It clears when
 * the save is done:
 *   - the server action's request settles (fetch carrying a Next-Action
 *     header), which covers actions that redirect and ones that do not;
 *   - the URL changes (a redirect such as ?saved=1);
 *   - or, as a last resort, after 20 seconds.
 *
 * Only forms that run a server action get it. A plain form - "Export CSV" to a
 * download route, a GET filter - never produces an action request or a URL
 * change the page can see, so a spinner there would never clear.
 *
 * The listener runs in the CAPTURE phase: React handles action forms on the
 * way back up and marks the event as handled, so a bubbling listener saw every
 * real save as "already dealt with" and skipped it.
 *
 * Buttons that show their own pending state (SubmitButton, FormSubmitButton -
 * both render aria-busy) and anything marked data-no-loader are left alone.
 */

const ATTR = "data-nl-loading";
const FALLBACK_MS = 20_000;

function clearAll() {
  document.querySelectorAll(`[${ATTR}]`).forEach((el) => {
    el.removeAttribute(ATTR);
    el.removeAttribute("aria-busy");
  });
}

function isActionRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  try {
    if (init?.headers && new Headers(init.headers).has("next-action")) return true;
    if (typeof Request !== "undefined" && input instanceof Request) {
      return input.headers.has("next-action");
    }
  } catch {
    // Unreadable headers are not an action request we can track.
  }
  return false;
}

/**
 * Does this submit run a server action? React renders an action form (or a
 * button's formAction) with a `javascript:` placeholder URL once hydrated, and
 * with a hidden `$ACTION_…` field in the server HTML.
 */
function runsServerAction(form: HTMLFormElement, submitter: HTMLElement | null): boolean {
  const js = (value: string | null) => (value ?? "").trim().toLowerCase().startsWith("javascript:");
  if (submitter?.hasAttribute("formaction")) {
    return js(submitter.getAttribute("formaction")) || (submitter.getAttribute("name") ?? "").startsWith("$ACTION_");
  }
  if (js(form.getAttribute("action"))) return true;
  return Boolean(form.querySelector('input[name^="$ACTION_"]'));
}

export function SubmitLoader() {
  const pathname = usePathname();
  const query = useSearchParams().toString();

  // A new URL means the save finished and redirected.
  useEffect(() => {
    clearAll();
  }, [pathname, query]);

  useEffect(() => {
    let inflight = 0;
    let fallback: ReturnType<typeof setTimeout> | undefined;

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.hasAttribute("data-no-loader")) return;

      const submitter = (event.submitter as HTMLElement | null) ?? null;
      if (!runsServerAction(form, submitter)) return;

      const button =
        submitter ??
        form.querySelector<HTMLElement>('button[type="submit"], button:not([type]), input[type="submit"]');
      if (!button || button.hasAttribute("aria-busy") || button.hasAttribute("data-no-loader")) return;

      // Not `disabled`: that would drop the pressed button's name/value (and
      // its formAction) from what the form sends.
      button.setAttribute(ATTR, "");
      button.setAttribute("aria-busy", "true");

      clearTimeout(fallback);
      fallback = setTimeout(clearAll, FALLBACK_MS);
    };

    const realFetch = window.fetch;
    const patched: typeof window.fetch = (input, init) => {
      if (!isActionRequest(input, init)) return realFetch(input, init);
      inflight++;
      const done = () => {
        inflight = Math.max(0, inflight - 1);
        // A moment for the refreshed page to paint before the spinner goes.
        if (inflight === 0) setTimeout(() => inflight === 0 && clearAll(), 300);
      };
      return realFetch(input, init).then(
        (res) => {
          done();
          return res;
        },
        (err) => {
          done();
          throw err;
        },
      );
    };
    window.fetch = patched;

    // Coming back to a page from the browser's cache must not show a stale spinner.
    const onPageShow = () => clearAll();

    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("pageshow", onPageShow);
      if (window.fetch === patched) window.fetch = realFetch;
      clearTimeout(fallback);
    };
  }, []);

  return (
    <style>{`
      [${ATTR}] {
        pointer-events: none;
        cursor: progress;
        opacity: 0.85;
      }
      [${ATTR}]::before {
        content: "";
        display: inline-block;
        width: 0.95em;
        height: 0.95em;
        margin-right: 0.5em;
        vertical-align: -0.12em;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 9999px;
        animation: nl-submit-spin 0.7s linear infinite;
      }
      input[${ATTR}]::before { content: none; }
      @keyframes nl-submit-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) {
        [${ATTR}]::before { animation-duration: 1.6s; }
      }
    `}</style>
  );
}
