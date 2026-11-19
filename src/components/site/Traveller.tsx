"use client";

import { useEffect, useRef } from "react";
import { TubScene, type TubController } from "./TubScene";
import { useFlavour } from "./Flavour";
import { useReduce } from "./Reveal";

/*
 * One 3D tub for the top of the homepage, travelling as you scroll (the
 * "traveller", after the MotionSites Protein Bars design):
 *
 *   hero  ──fly──▶  "what's inside"  ──fly──▶  "one product" (as its faint background)
 *
 * The hero, the inside scene and the "one product" section render empty
 * slots marked [data-tub-slot];
 * this component floats a single TubScene above the page and, every frame,
 * places it from their live positions:
 *
 * - Leg 1, scrubbed by scroll: starts when the inside section enters the
 *   bottom of the viewport, lands when its top reaches the top; arcs a little
 *   sideways and tilts on the way.
 * - Leg 2, scrubbed the same way: as "one product" comes up, the tub flies
 *   from the inside slot to that section's slot, arcing the other way, and
 *   fades to a whisper (about 7%, multiply-blended) as it lands. From then on
 *   it sits in the section as its background and scrolls away with it.
 *
 * Size changes are a CSS scale of a fixed square box, so the WebGL canvas
 * never resizes mid-flight. The inside scene turns the tub and lifts its lid
 * through `travelTub`. With reduced motion the tub jumps instead of flying.
 */
export const travelTub: { current: TubController | null } = { current: null };

const GHOST = 0.07; // how present the tub is as a background

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Box = { cx: number; cy: number; size: number };
const boxOf = (r: DOMRect): Box => ({ cx: r.left + r.width / 2, cy: r.top + r.height / 2, size: Math.min(r.width, r.height) });

export function Traveller() {
  const { flavour, look } = useFlavour();
  const reduce = useReduce();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    const slotA = document.querySelector<HTMLElement>('[data-tub-slot="hero"]');
    const slotB = document.querySelector<HTMLElement>('[data-tub-slot="inside"]');
    const inside = document.getElementById("inside");
    const slotC = document.querySelector<HTMLElement>('[data-tub-slot="statement"]');
    const next = document.querySelector<HTMLElement>(".statement");
    if (!el || !slotA || !slotB || !inside) return;

    // The box is drawn at the background size (the largest the tub gets) and
    // scaled down to the slots, so it stays sharp at every stop.
    let base = 1;
    const measure = () => {
      base = Math.max(slotA.offsetWidth, slotB.offsetWidth, slotC?.offsetWidth ?? 0, 1);
      el.style.width = `${base}px`;
      el.style.height = `${base}px`;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(slotA);
    ro.observe(slotB);
    if (slotC) ro.observe(slotC);
    window.addEventListener("resize", measure);

    let raf = 0;
    const tick = () => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const a = boxOf(slotA.getBoundingClientRect());
      const b = boxOf(slotB.getBoundingClientRect());
      const ins = inside.getBoundingClientRect();

      // Leg 1: hero → inside.
      let t = clamp(1 - ins.top / vh);
      if (reduce) t = t > 0.5 ? 1 : 0;
      const e = easeInOut(t);
      const lift = Math.sin(Math.PI * e);
      let cx = lerp(a.cx, b.cx, e) + lift * vw * 0.05;
      let cy = lerp(a.cy, b.cy, e);
      let size = lerp(a.size, b.size, e);
      let rot = lift * -12;
      let opacity = 1;

      // Leg 2: inside → the "one product" section, landing as its background.
      let u = slotC && next ? clamp((vh - next.getBoundingClientRect().top) / (vh * 0.9)) : 0;
      if (reduce) u = u > 0.5 ? 1 : 0;
      if (slotC && u > 0) {
        const c = boxOf(slotC.getBoundingClientRect());
        const g = easeInOut(u);
        const arc = Math.sin(Math.PI * g);
        cx = lerp(b.cx, c.cx, g) - arc * vw * 0.08;
        cy = lerp(b.cy, c.cy, g);
        size = lerp(b.size, c.size, g);
        rot = lerp(0, 8, g) + arc * 10;
        opacity = lerp(1, GHOST, easeInOut(clamp((u - 0.35) / 0.65)));
      }

      el.style.transform = `translate3d(${cx - base / 2}px, ${cy - base / 2}px, 0) scale(${size / base}) rotate(${rot}deg)`;
      el.style.opacity = String(opacity);
      el.style.visibility = opacity < 0.005 ? "hidden" : "visible";
      // As a background it only darkens the page (like a print), so its white
      // lid and label never wash over the text and cards above it.
      el.style.mixBlendMode = u > 0.7 ? "multiply" : "normal";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [reduce]);

  return (
    <div ref={box} className="traveller" aria-hidden="true">
      <TubScene
        flavour={flavour}
        lid={look(flavour).lid}
        controllerRef={travelTub as React.MutableRefObject<TubController | null>}
        className="traveller__canvas"
        idleSpin
        interactive
      />
    </div>
  );
}
