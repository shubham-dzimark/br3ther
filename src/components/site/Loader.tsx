"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from "framer-motion";
import { WordLoader } from "./WordLoader";
import { EASE, useReduce } from "./Reveal";

/*
 * Loading screens, built with Framer Motion.
 *
 * <RouteLoader>: what (site)/loading.tsx shows while a page's data loads:
 * BR3THR drawing itself in strokes (WordLoader) over the flavour ground, a
 * caption and a bar that keeps creeping forward.
 *
 * <SiteLoader>: the same picture over every full load of a shop page, so a
 * cold load reads as one continuous move; see below.
 */
const NEUTRAL = "#d9d5cc";

function Stage({ ground, progress }: { ground: string; progress?: MotionValue<number> }) {
  const creep = useMotionValue(0.08);
  const value = progress ?? creep;
  const width = useTransform(value, (v) => `${Math.round(v * 1000) / 10}%`);

  useEffect(() => {
    if (progress) return;
    // Without a real signal, ease towards 90% so it never looks stuck.
    const c = animate(creep, 0.9, { duration: 6, ease: [0.1, 0.6, 0.3, 1] });
    return () => c.stop();
  }, [progress, creep]);

  return (
    <div className="loader__stage" style={{ background: ground }}>
      <span className="pagehead__rings loader__rings" aria-hidden="true" />
      <div className="loader__center">
        <motion.span
          className="loader__word"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <WordLoader />
        </motion.span>
        <motion.p
          className="kicker loader__cap"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.35 }}
        >
          No.3 Daily Blend
        </motion.p>
        <span className="loader__track" aria-hidden="true">
          <motion.span className="loader__bar" style={{ width }} />
        </span>
      </div>
    </div>
  );
}

/** The loading.tsx screen between pages. */
export function RouteLoader({ ground = NEUTRAL }: { ground?: string }) {
  return (
    <div className="site loader loader--route" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Stage ground={ground} />
    </div>
  );
}

/**
 * The website loader: covers every full load or refresh of a shop page until
 * the page is ready (fonts and images loaded, and on the homepage the 3D tub's
 * first frame), then lifts away. Client-side page changes use <RouteLoader>
 * from loading.tsx instead. Never shown with reduced motion.
 */
export function SiteLoader({ ground }: { ground: string }) {
  const reduce = useReduce();
  const progress = useMotionValue(0.08);
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (reduce) {
      const t = window.setTimeout(() => setShow(false), 0);
      return () => window.clearTimeout(t);
    }

    const root = document.documentElement;
    root.style.overflow = "hidden";
    const creep = animate(progress, 0.85, { duration: 3, ease: [0.1, 0.6, 0.3, 1] });
    const started = performance.now();
    let done = false;

    // What "ready" means on this page.
    const hasTub = Boolean(document.querySelector(".hero__tub"));
    let tubReady = !hasTub;
    let pageReady = document.readyState === "complete";

    const finish = () => {
      if (done) return;
      done = true;
      // Let the wordmark finish rising before the curtain lifts.
      const wait = Math.max(0, 1000 - (performance.now() - started));
      window.setTimeout(() => {
        creep.stop();
        animate(progress, 1, { duration: 0.35, ease: "easeOut" }).then(() => setShow(false));
      }, wait);
    };
    const check = () => { if (tubReady && pageReady) finish(); };
    const onTub = () => { tubReady = true; check(); };
    const onLoad = () => {
      const fontsReady = () => { pageReady = true; check(); };
      if (document.fonts) document.fonts.ready.then(fontsReady);
      else fontsReady();
    };

    window.addEventListener("br3thr:tub-ready", onTub, { once: true });
    if (pageReady) onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    const cap = window.setTimeout(finish, hasTub ? 4000 : 2500);

    return () => {
      window.removeEventListener("br3thr:tub-ready", onTub);
      window.removeEventListener("load", onLoad);
      window.clearTimeout(cap);
      creep.stop();
      root.style.overflow = "";
    };
  }, [reduce, progress]);

  useEffect(() => {
    if (!show) document.documentElement.style.overflow = "";
  }, [show]);

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="site-loader"
          className="loader loader--intro"
          role="status"
          aria-label="Loading"
          exit={{ clipPath: "inset(0 0 100% 0)", transition: { duration: 0.85, ease: [0.76, 0, 0.24, 1] } }}
          style={{ clipPath: "inset(0 0 0% 0)" }}
        >
          <Stage ground={ground} progress={progress} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
