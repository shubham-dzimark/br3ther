"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

/*
 * The page's motion layer, mounted once.
 *
 * Smooth scroll: Lenis, the only scroll engine on the page, driving GSAP
 * ScrollTrigger from its own scroll event and ticked by GSAP's clock.
 * Entrances: every [data-reveal] block brings its [data-r] parts in one after
 * another (rise + fade, once). Headings marked [data-split] come in word by
 * word; the heading keeps its full text as its accessible name.
 * Reduced motion: none of this runs and everything is simply there.
 */
export function Motion() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.classList.toggle("no-motion", reduce);
    if (reduce) return;

    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1 });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

    // In-page links glide instead of jumping.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"], a[href^="/#"]');
      if (!a) return;
      const id = a.getAttribute("href")!.replace(/^\/?#/, "");
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: -68, duration: 1.2 });
      history.replaceState(null, "", `#${id}`);
      window.setTimeout(() => el.focus?.({ preventScroll: true }), 900);
    };
    document.addEventListener("click", onClick);

    const ctx = gsap.context(() => {
      // Word-by-word headings.
      document.querySelectorAll<HTMLElement>("[data-split]").forEach((h) => {
        if (h.dataset.splitDone) return;
        const text = h.textContent ?? "";
        h.setAttribute("aria-label", text);
        h.dataset.splitDone = "1";
        h.innerHTML = text
          .split(/(\s+)/)
          .map((w) =>
            /\s+/.test(w)
              ? w
              : `<span aria-hidden="true" style="display:inline-block;overflow:hidden;vertical-align:bottom"><span class="w" style="display:inline-block">${w}</span></span>`,
          )
          .join("");
        gsap.from(h.querySelectorAll(".w"), {
          yPercent: 110,
          duration: 0.9,
          ease: "power4.out",
          stagger: 0.07,
          scrollTrigger: { trigger: h, start: "top 88%", once: true },
        });
      });

      // Section parts, staggered.
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((block) => {
        const parts = block.querySelectorAll<HTMLElement>("[data-r]");
        if (!parts.length) return;
        gsap.from(parts, {
          y: 28,
          opacity: 0,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.08,
          scrollTrigger: { trigger: block, start: "top 82%", once: true },
        });
      });

      // Pictures drift slightly against the scroll.
      document.querySelectorAll<HTMLElement>("[data-drift] img").forEach((img) => {
        gsap.fromTo(
          img,
          { scale: 1.12, yPercent: -4 },
          {
            scale: 1.12,
            yPercent: 4,
            ease: "none",
            scrollTrigger: { trigger: img.parentElement, start: "top bottom", end: "bottom top", scrub: true },
          },
        );
      });

      // The shutter: the band opens from the left edge once.
      const band = document.querySelector<HTMLElement>("[data-shutter]");
      if (band) {
        gsap.fromTo(
          band,
          { clipPath: "inset(0 100% 0 0)" },
          { clipPath: "inset(0 0% 0 0)", duration: 1.1, ease: "power3.inOut", scrollTrigger: { trigger: band, start: "top 75%", once: true } },
        );
      }
    });

    // Header: out of the way going down, back going up.
    const head = document.querySelector<HTMLElement>(".site-head");
    let lastY = 0;
    const onScroll = ({ scroll }: { scroll: number }) => {
      if (!head) return;
      const down = scroll > lastY && scroll > 200;
      head.dataset.hidden = down ? "true" : "false";
      lastY = scroll;
    };
    lenis.on("scroll", onScroll);

    // Measurements change once fonts and pictures settle.
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh);
    window.addEventListener("load", refresh);

    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("load", refresh);
      ctx.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
      delete (window as unknown as { __lenis?: Lenis }).__lenis;
    };
  }, []);

  return null;
}
