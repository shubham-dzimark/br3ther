"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useInView,
  type Variants,
} from "framer-motion";
import { TubScene } from "./TubScene";
import { themeOf, useFlavour } from "./Flavour";
import { EASE, useReduce } from "./Reveal";

/*
 * The first screen: a flavour carousel around the 3D tub.
 *
 * The ground is the flavour's colour. Changing flavour grows the new colour
 * out from behind the tub as a circle, the name rises in letter by letter, the
 * outline counter crossfades, the tub's lid takes the new colour and the tub
 * gives a small squash. Change it by dragging the tub, the arrow buttons, the
 * flavour pills, the arrow keys (while the hero is on screen) or Autoplay.
 *
 * Autoplay advances every 3.6 s while the hero is at least half on screen, the
 * tab is visible and nobody is pointing at or focused inside it. It is off
 * with reduced motion, where every change is also instant.
 */
const GLIDE = [0.25, 0.75, 0.2, 1] as const;
const AUTOPLAY_MS = 3600;

type L = { d: number; i: number };
const letter: Variants = {
  enter: ({ d }: L) => ({ y: d > 0 ? "110%" : "-110%", opacity: 0 }),
  center: ({ i }: L) => ({ y: "0%", opacity: 1, transition: { duration: 0.62, ease: EASE, delay: 0.12 + i * 0.022 } }),
  exit: ({ d, i }: L) => ({
    y: d > 0 ? "-110%" : "110%",
    opacity: 0,
    transition: { duration: 0.3, ease: [0.45, 0, 0.75, 0.3], delay: i * 0.011 },
  }),
};

const BITS = [
  { x: "11%", y: "22%", s: 1, d: 0 },
  { x: "84%", y: "19%", s: 0.75, d: 1 },
  { x: "7%", y: "70%", s: 0.6, d: 2 },
  { x: "68%", y: "13%", s: 0.5, d: 3 },
  { x: "90%", y: "64%", s: 0.55, d: 4 },
];

export function Hero({ price }: { price: string }) {
  const { flavours, index, flavour, dir, go, setFlavour } = useFlavour();
  const reduce = useReduce();
  const theme = themeOf(flavour);

  const root = useRef<HTMLElement>(null);
  const onScreen = useInView(root, { amount: 0.5 });
  const [autoWanted, setAuto] = useState(true);
  const auto = autoWanted && !reduce;
  const [hold, setHold] = useState(false);
  const touched = useRef(0);

  // Grounds: the newest one grows over the last, then the older ones are dropped.
  const [grounds, setGrounds] = useState([{ id: 0, color: theme.ground }]);
  const [groundFor, setGroundFor] = useState(theme.ground);
  if (groundFor !== theme.ground) {
    // Adjusting state while rendering (not in an effect): a new ground starts growing.
    setGroundFor(theme.ground);
    setGrounds((gs) => [...gs.slice(-2), { id: gs[gs.length - 1].id + 1, color: theme.ground }]);
  }

  const squash = useAnimationControls();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!reduce) squash.start({ scaleX: [1, 1.05, 0.98, 1], scaleY: [1, 0.94, 1.03, 1], transition: { duration: 0.55, ease: "easeOut" } });
  }, [flavour, reduce, squash]);

  const step = (d: number) => { touched.current = Date.now(); go(d); };

  useEffect(() => {
    if (!auto || !onScreen || hold) return;
    const t = window.setInterval(() => {
      if (document.hidden || Date.now() - touched.current < AUTOPLAY_MS) return;
      go(1);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(t);
  }, [auto, onScreen, hold, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!onScreen || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, select, textarea, [contenteditable]")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); touched.current = Date.now(); go(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); touched.current = Date.now(); go(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onScreen, go]);

  const prev = flavours[(index - 1 + flavours.length) % flavours.length];
  const next = flavours[(index + 1) % flavours.length];
  const words = flavour.toUpperCase().split(" ");
  let li = 0;

  return (
    <section
      ref={root}
      className="hero"
      aria-labelledby="hero-title"
      aria-roledescription="carousel"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocusCapture={() => setHold(true)}
      onBlurCapture={() => setHold(false)}
    >
      {grounds.map((g, i) => (
        <motion.div
          key={g.id}
          className="hero__ground"
          aria-hidden="true"
          style={{ background: g.color }}
          initial={g.id === 0 ? false : { clipPath: "circle(0% at 50% 44%)" }}
          animate={{ clipPath: "circle(150% at 50% 44%)" }}
          transition={{ duration: reduce ? 0 : 0.9, ease: GLIDE }}
          onAnimationComplete={() => i > 0 && setGrounds((gs) => gs.filter((x) => x.id >= g.id))}
        />
      ))}
      <motion.div
        className="hero__rings"
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
      />
      {BITS.map((b) => (
        <motion.span
          key={b.d}
          className="hero__bit"
          aria-hidden="true"
          style={{ left: b.x, top: b.y, ["--s" as string]: b.s }}
          initial={reduce ? false : { opacity: 0 }}
          animate={
            reduce
              ? { opacity: 0.4, backgroundColor: theme.bit }
              : {
                  opacity: 0.42,
                  backgroundColor: theme.bit,
                  y: [0, -22 - b.d * 3, 0],
                  x: [0, b.d % 2 ? 12 : -12, 0],
                  rotate: [0, b.d % 2 ? 10 : -10, 0],
                }
          }
          transition={{
            opacity: { duration: 0.9, delay: 0.3 + b.d * 0.09 },
            backgroundColor: { duration: 0.6 },
            default: { duration: 7 + b.d * 0.9, repeat: Infinity, ease: "easeInOut" },
          }}
        />
      ))}

      <h1 id="hero-title" className="sr-only">BR3THR No.3 Daily Blend</h1>
      <p className="sr-only" aria-live="polite">
        {flavour}, flavour {index + 1} of {flavours.length}
      </p>

      <div className="hero__count" aria-hidden="true">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={index}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.38, ease: EASE, delay: reduce ? 0 : 0.06 } }}
            exit={{ opacity: 0, y: -10, transition: { duration: reduce ? 0 : 0.22, ease: [0.5, 0, 0.75, 0] } }}
          >
            {String(index + 1).padStart(2, "0")}
          </motion.span>
        </AnimatePresence>
      </div>

      <motion.div
        className="hero__tub"
        drag={reduce ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.22}
        dragSnapToOrigin
        onDragEnd={(_, info) => {
          if (info.offset.x < -60 || info.velocity.x < -450) step(1);
          else if (info.offset.x > 60 || info.velocity.x > 450) step(-1);
        }}
        whileDrag={{ cursor: "grabbing" }}
        initial={reduce ? false : { opacity: 0, y: 80, scale: 0.88 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
      >
        <motion.div className="hero__tubin" animate={squash}>
          <TubScene flavour={flavour} className="hero__tubcanvas" idleSpin interactive />
        </motion.div>
      </motion.div>

      <div className="hero__title" aria-hidden="true">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.span key={flavour} className="hero__name" custom={dir}>
            {words.map((w, wi) => (
              <span key={wi} className="hero__w">
                {w.split("").map((ch) => {
                  const n = li++;
                  return (
                    <span key={n} className="mask">
                      <motion.span
                        className="mask__in"
                        custom={{ d: dir, i: n }}
                        variants={letter}
                        initial={reduce ? false : "enter"}
                        animate={reduce ? { y: "0%", opacity: 1 } : "center"}
                        exit={reduce ? { opacity: 0, transition: { duration: 0 } } : "exit"}
                      >
                        {ch}
                      </motion.span>
                    </span>
                  );
                })}
              </span>
            ))}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="hero__arrows">
        <button type="button" className="hero__arrow" onClick={() => step(-1)} aria-label={`Previous flavour: ${prev}`}>
          <Arrow flip />
        </button>
        <button type="button" className="hero__arrow hero__arrow--main" onClick={() => step(1)} aria-label={`Next flavour: ${next}`}>
          <Arrow />
        </button>
      </div>

      <button
        type="button"
        className="hero__auto"
        aria-pressed={auto}
        onClick={() => { setAuto((a) => !a); touched.current = Date.now(); }}
      >
        <span className="hero__autoring" aria-hidden="true">
          {auto ? (
            <svg viewBox="0 0 12 12"><rect x="2.5" y="2" width="2.4" height="8" rx="1" /><rect x="7.1" y="2" width="2.4" height="8" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 12 12"><path d="M3.5 2.2v7.6L10 6z" /></svg>
          )}
        </span>
        Autoplay
      </button>

      <motion.div
        className="hero__foot"
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE, delay: 0.6 }}
      >
        <div className="hero__left">
          <p className="hero__lede">No.3 Daily Blend. One tub, thirty scoops, one month.</p>
          <div className="hero__pills" role="group" aria-label="Flavour">
            {flavours.map((f) => (
              <button
                key={f}
                type="button"
                className="pill"
                aria-pressed={f === flavour}
                onClick={() => { touched.current = Date.now(); setFlavour(f); }}
              >
                <span className="pill__dot" style={{ background: themeOf(f).deep }} aria-hidden="true" />
                {f}
                {f === flavour ? <motion.span layoutId="pill-on" className="pill__on" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="hero__cta">
          <span className="price">from {price}</span>
          <motion.a className="btn" href="#buy" whileHover={reduce ? undefined : { y: -2 }} whileTap={reduce ? undefined : { scale: 0.97 }}>
            Buy {flavour} <span className="arrow" aria-hidden="true">→</span>
          </motion.a>
        </div>
      </motion.div>
    </section>
  );
}

function Arrow({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M3 10h13M11 4.5 16.5 10 11 15.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
