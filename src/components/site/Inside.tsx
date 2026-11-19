"use client";

import { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
} from "framer-motion";
import { TubScene, type TubController } from "./TubScene";
import { themeOf, useFlavour } from "./Flavour";
import { EASE, useReduce } from "./Reveal";

/*
 * "What's inside", pinned. The section is four screens tall; its first screen
 * sticks while you scroll through four steps. Scroll turns the tub one and a
 * half times and lifts its lid through the middle steps; each step change
 * crossfades the headline, the caption and the outline step number. The step
 * buttons jump to a step. Screen readers get all four steps as one list.
 *
 * The formula is sample content for the demo product; replace before launch.
 */
const STEPS = [
  { head: "Six things, all named", cap: "Creatine 3 g, electrolytes 600 mg, magnesium 150 mg, vitamin D3 25 µg, citric acid, natural flavour.", icon: "leaf" },
  { head: "Nothing hidden", cap: "No added sugar, no sweeteners, no fillers, no colour. Every amount is on the label.", icon: "grain" },
  { head: "Thirty scoops", cap: "300 g of powder and a measured 10 g scoop packed inside. One a day lasts a month.", icon: "scoop" },
  { head: "A quarter turn", cap: "A foil seal under the lid, and it closes tight with one twist. The tub is recyclable PP 5.", icon: "lid" },
] as const;

export function Inside() {
  const { flavour } = useFlavour();
  const reduce = useReduce();
  const root = useRef<HTMLElement>(null);
  const tub = useRef<TubController | null>(null);
  const [step, setStep] = useState(0);

  const { scrollYProgress } = useScroll({ target: root, offset: ["start start", "end end"] });
  const bar = useSpring(scrollYProgress, { stiffness: 160, damping: 30, mass: 0.4 });

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    tub.current?.setProgress(p);
    const s = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length));
    setStep((cur) => (cur === s ? cur : s));
  });

  const goTo = (i: number) => {
    const el = root.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const run = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + ((i + 0.5) / STEPS.length) * run, behavior: reduce ? "auto" : "smooth" });
  };

  const fade = {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.46, ease: EASE, delay: reduce ? 0 : 0.04 } },
    exit: { opacity: 0, y: -10, transition: { duration: reduce ? 0 : 0.24, ease: [0.5, 0, 0.75, 0] as const } },
  };

  return (
    <section
      id="inside"
      ref={root}
      className="inside"
      aria-labelledby="inside-title"
      tabIndex={-1}
      style={{ ["--flav-ground" as string]: themeOf(flavour).ground }}
    >
      <div className="inside__pin">
        <div className="inside__num" aria-hidden="true">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={step} {...fade}>{String(step + 1).padStart(2, "0")}</motion.span>
          </AnimatePresence>
        </div>

        <div className="inside__tub">
          <TubScene flavour={flavour} controllerRef={tub} idleSpin={false} interactive={false} className="inside__canvas" />
        </div>

        <div className="inside__copy">
          <h2 id="inside-title" className="kicker">What&rsquo;s inside</h2>
          <div className="inside__swap" aria-hidden="true">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p key={step} className="inside__head" {...fade}>{STEPS[step].head}</motion.p>
            </AnimatePresence>
          </div>
          <div className="inside__swap inside__swap--cap" aria-hidden="true">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p key={step} className="inside__cap" {...fade}>{STEPS[step].cap}</motion.p>
            </AnimatePresence>
          </div>
          <ol className="sr-only">
            {STEPS.map((s) => <li key={s.head}>{s.head}. {s.cap}</li>)}
          </ol>
          <p className="inside__note">Amounts per 10 g scoop. No.3 is a demo product; this formula is a sample.</p>
        </div>

        <div className="inside__steps" role="group" aria-label="Jump to a step">
          {STEPS.map((s, i) => (
            <button key={s.head} type="button" aria-current={i === step ? "step" : undefined} onClick={() => goTo(i)} aria-label={`Step ${i + 1}: ${s.head}`}>
              <StepIcon name={s.icon} />
            </button>
          ))}
        </div>

        <motion.span className="inside__bar" aria-hidden="true" style={{ scaleX: bar }} />
      </div>
    </section>
  );
}

function StepIcon({ name }: { name: (typeof STEPS)[number]["icon"] }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      {name === "leaf" && <><path {...p} d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14Z" /><path {...p} d="M5 19 13 11" /></>}
      {name === "grain" && <><path {...p} d="M12 3v18" /><path {...p} d="M12 7c-3 0-4-2-4-3 2 0 4 1 4 3Zm0 0c3 0 4-2 4-3-2 0-4 1-4 3Zm0 5c-3 0-4-2-4-3 2 0 4 1 4 3Zm0 0c3 0 4-2 4-3-2 0-4 1-4 3Z" /></>}
      {name === "scoop" && <><path {...p} d="M3 10h11a5.5 5.5 0 0 1-11 0Z" /><path {...p} d="M14 11.5 21 8" /></>}
      {name === "lid" && <><rect {...p} x="4" y="9" width="16" height="11" rx="2" /><path {...p} d="M3 6h18v3H3zM9 3.5c2-1 4-1 6 0" /></>}
    </svg>
  );
}
