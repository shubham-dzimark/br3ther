"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { useReduce } from "./Reveal";

/*
 * The three "How to take it" icons, drawn by hand on one 120-unit grid with a
 * single stroke weight and round caps and joins, so they read as a set.
 *
 * Two animation layers that never touch the same element:
 * - GSAP (DrawSVGPlugin + ScrollTrigger) tells each icon's story once, when its
 *   card scrolls in: outlines draw on, then the action plays (powder falls and
 *   water rises; the sun comes up and the week ticks in; the tub is ticked and
 *   the reorder arrow circles round).
 * - Motion (framer-motion) adds the hover gesture on wrapper groups: the shaker
 *   shakes, the rays pulse, the arrow spins.
 * With reduced motion GSAP jumps to the finished drawing and nothing moves.
 */
gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 3.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const FILL = "rgba(255,255,255,.55)";
const box = { transformBox: "fill-box" as const, originX: 0.5, originY: 0.5 };

function useStory(build: (tl: gsap.core.Timeline, q: (s: string) => Element[]) => void) {
  const ref = useRef<SVGSVGElement>(null);
  const reduce = useReduce();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const q = (s: string) => gsap.utils.toArray<Element>(s, el);
      const tl = gsap.timeline({
        defaults: { ease: "power2.out" },
        scrollTrigger: reduce ? undefined : { trigger: el, start: "top 82%", once: true },
      });
      build(tl, q);
      if (reduce) tl.progress(1);
    }, el);
    return () => ctx.revert();
  }, [reduce, build]);
  return ref;
}

/* ---------------- Day 1: a level scoop into the shaker, then a shake ---------------- */

const day1 = (tl: gsap.core.Timeline, q: (s: string) => Element[]) => {
  tl.from(q(".d"), { drawSVG: 0, duration: 0.7, stagger: 0.12 })
    .from(q(".scoop"), { x: -10, y: -8, rotate: -18, opacity: 0, transformOrigin: "100% 50%", duration: 0.5 }, 0.2)
    .fromTo(q(".powder"), { x: -14, y: -10, opacity: 0 }, { x: 0, y: 14, opacity: 1, duration: 0.45, stagger: 0.09, ease: "power1.in" }, "-=0.1")
    .to(q(".powder"), { opacity: 0, duration: 0.2, stagger: 0.09 }, "-=0.3")
    .from(q(".water"), { scaleY: 0, transformOrigin: "50% 100%", duration: 0.7, ease: "power3.out" }, "-=0.35")
    .from(q(".wave"), { drawSVG: 0, opacity: 0, duration: 0.4 }, "-=0.35")
    .to(q(".shaker"), {
      keyframes: { rotate: [0, -9, 9, -7, 7, 0] },
      transformOrigin: "50% 100%",
      duration: 0.8,
      ease: "power1.inOut",
    });
};

export function ShakeIcon({ active }: { active: boolean }) {
  const ref = useStory(day1);
  const reduce = useReduce();
  return (
    <svg ref={ref} viewBox="0 0 120 120" className="stepicon" aria-hidden="true">
      <defs>
        <clipPath id="si-body"><path d="M47 47 h26 l-2.6 52 a5 5 0 0 1 -5 4.7 H54.6 a5 5 0 0 1 -5 -4.7 Z" /></clipPath>
      </defs>
      <g transform="translate(14 6)">
      <g className="scoop">
        <path {...S} className="d" d="M12 22 h26 a13 13 0 0 1 -26 0 Z" />
        <path {...S} className="d" d="M38 22 l18 -11" />
      </g>
      <circle className="powder" cx="44" cy="30" r="2.4" fill="currentColor" />
      <circle className="powder" cx="49" cy="27" r="2" fill="currentColor" />
      <circle className="powder" cx="46" cy="35" r="1.8" fill="currentColor" />
      <motion.g
        style={box}
        animate={active && !reduce ? { rotate: [0, -10, 10, -8, 8, 0] } : { rotate: 0 }}
        transition={{ duration: 0.7, ease: "easeInOut" }}
      >
        <g className="shaker">
          <rect className="water" x="44" y="72" width="32" height="34" fill={FILL} clipPath="url(#si-body)" />
          <path {...S} className="wave" d="M49 73 q5.5 -4 11 0 t11 0" />
          <path {...S} className="d" d="M44 46 h32 l-3 54 a7 7 0 0 1 -7 6.5 H54 a7 7 0 0 1 -7 -6.5 Z" />
          <path {...S} className="d" d="M45 37 h30 a3 3 0 0 1 3 3 v6 H42 v-6 a3 3 0 0 1 3 -3 Z" />
          <path {...S} className="d" d="M54 37 v-7 a2 2 0 0 1 2 -2 h8 a2 2 0 0 1 2 2 v7" />
        </g>
      </motion.g>
      </g>
    </svg>
  );
}

/* ---------------- Day 7: the sun comes up, seven days tick in ---------------- */

const RAYS = [
  "M31.8 63.7 L24.3 61", "M42.8 49.4 L38.2 42.9", "M60 44 L60 36", "M77.2 49.4 L81.8 42.9", "M88.2 63.7 L95.7 61",
];

const day7 = (tl: gsap.core.Timeline, q: (s: string) => Element[]) => {
  tl.from(q(".horizon"), { drawSVG: "50% 50%", duration: 0.6 })
    .from(q(".sun"), { y: 26, duration: 0.9, ease: "power3.out" }, "-=0.2")
    .from(q(".ray"), { drawSVG: 0, opacity: 0, duration: 0.35, stagger: 0.08 }, "-=0.35")
    .from(q(".day"), { drawSVG: 0, duration: 0.3, stagger: 0.05 }, "-=0.2")
    .fromTo(q(".dayfill"), { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.25, stagger: 0.11, ease: "back.out(2.5)" });
};

export function MorningIcon({ active }: { active: boolean }) {
  const ref = useStory(day7);
  const reduce = useReduce();
  return (
    <svg ref={ref} viewBox="0 0 120 120" className="stepicon" aria-hidden="true">
      <defs><clipPath id="si-sky"><rect x="0" y="0" width="120" height="74" /></clipPath></defs>
      <motion.g
        style={{ ...box, originY: 1 }}
        animate={active && !reduce ? { scale: [1, 1.12, 1], opacity: [1, 0.7, 1] } : { scale: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: "easeInOut" }}
      >
        {RAYS.map((d) => <path key={d} {...S} className="ray" d={d} />)}
      </motion.g>
      <g clipPath="url(#si-sky)">
        <motion.g animate={active && !reduce ? { y: [0, -4, 0] } : { y: 0 }} transition={{ duration: 0.9, ease: "easeInOut" }}>
          <g className="sun">
            <path d="M38 74 a22 22 0 0 1 44 0 Z" fill={FILL} />
            <path {...S} d="M38 74 a22 22 0 0 1 44 0" />
          </g>
        </motion.g>
      </g>
      <path {...S} className="horizon" d="M14 74 h92" />
      {Array.from({ length: 7 }, (_, i) => (
        <g key={i}>
          <circle className="dayfill" cx={21 + i * 13} cy="96" r="4" fill="currentColor" />
          <circle {...S} strokeWidth={2.2} className="day" cx={21 + i * 13} cy="96" r="4" />
        </g>
      ))}
    </svg>
  );
}

/* ---------------- Day 30: the tub is ticked, the reorder arrow comes round ---------------- */

const day30 = (tl: gsap.core.Timeline, q: (s: string) => Element[]) => {
  tl.from(q(".d"), { drawSVG: 0, duration: 0.6, stagger: 0.1 })
    .from(q(".tubfill"), { opacity: 0, duration: 0.4 }, "-=0.3")
    .from(q(".tick"), { drawSVG: 0, duration: 0.45, ease: "power3.out" })
    .from(q(".loop"), { drawSVG: 0, duration: 1, ease: "power2.inOut" }, "-=0.1")
    .from(q(".head"), { drawSVG: "50% 50%", opacity: 0, duration: 0.3 }, "-=0.15");
};

export function ReorderIcon({ active }: { active: boolean }) {
  const ref = useStory(day30);
  const reduce = useReduce();
  return (
    <svg ref={ref} viewBox="0 0 120 120" className="stepicon" aria-hidden="true">
      <motion.g
        style={{ transformBox: "view-box", originX: "60px", originY: "64px" }}
        animate={active && !reduce ? { rotate: 360 } : { rotate: 0 }}
        transition={active ? { duration: 0.9, ease: [0.65, 0, 0.35, 1] } : { duration: 0 }}
      >
        <path {...S} className="loop" d="M96.8 33.1 A48 48 0 1 1 68.4 16.7" />
        <path {...S} className="head" d="M60.6 9.4 L68.4 16.7 L60.9 24.2" />
      </motion.g>
      <path className="tubfill" d="M38 58 h44 v22 H38 Z" fill={FILL} />
      <path {...S} className="d" d="M37 44 h46 v44 a8 8 0 0 1 -8 8 H45 a8 8 0 0 1 -8 -8 Z" />
      <path {...S} className="d" d="M36 34 h48 a3 3 0 0 1 3 3 v7 H33 v-7 a3 3 0 0 1 3 -3 Z" />
      <path {...S} className="d" strokeWidth={2.4} d="M37 58 h46" />
      <path {...S} className="d" strokeWidth={2.4} d="M37 80 h46" />
      <path {...S} className="tick" d="M51 69 l6 6 l12 -12" />
    </svg>
  );
}

export const STEP_ICONS = [ShakeIcon, MorningIcon, ReorderIcon];
