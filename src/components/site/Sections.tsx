"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { EASE, Reveal, RevealItem, SplitHeading, useReduce } from "./Reveal";
import { useFlavour } from "./Flavour";
import { WordSvg, BR3THR } from "./Wordmark";
import { STEP_ICONS } from "./StepIcons";

/*
 * The homepage sections after the pinned "inside" scene, with Framer Motion:
 * a scroll-read statement, a three-step timeline, a closing band with a
 * turning ring and a flavour ticker, and a footer wordmark that rises into
 * place. Every effect is transform or opacity only, and with reduced motion
 * each one renders in its final state.
 */

/* ------------------------------ statement ------------------------------ */

function ReadWord({ word, progress, range, reduce }: { word: string; progress: MotionValue<number>; range: [number, number]; reduce: boolean }) {
  const opacity = useTransform(progress, range, [0.22, 1]);
  return (
    <motion.span className="read__w" style={reduce ? undefined : { opacity }}>
      {word}{" "}
    </motion.span>
  );
}

function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.8 });
  const reduce = useReduce();
  const value = useMotionValue(0);
  const text = useTransform(value, (v) => `${Math.round(v)}${suffix}`);
  useEffect(() => {
    if (!seen) return;
    if (reduce) { value.set(to); return; }
    const c = animate(value, to, { duration: 1.4, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [seen, reduce, to, value]);
  return (
    <span ref={ref} aria-hidden="true">
      <motion.span>{text}</motion.span>
    </span>
  );
}

const STATS: { n: number; suffix: string; label: string }[] = [
  { n: 30, suffix: "", label: "scoops in a tub" },
  { n: 10, suffix: " g", label: "in every scoop" },
  { n: 1, suffix: "", label: "tub, one month" },
];

export function Statement({ title, text, note, img, alt }: { title: string; text: string; note: string; img: string; alt: string }) {
  const reduce = useReduce();
  const textRef = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: textRef, offset: ["start 85%", "end 50%"] });
  const photoRef = useRef<HTMLElement>(null);
  const { scrollYProgress: photoP } = useScroll({ target: photoRef, offset: ["start end", "end start"] });
  const photoY = useTransform(photoP, [0, 1], ["-8%", "8%"]);
  const words = text.split(/\s+/).filter(Boolean);

  return (
    <section className="sec statement" aria-labelledby="intro-title">
      {/* Where the travelling tub settles as this section's faint background (Traveller). */}
      <div className="statement__tubslot" data-tub-slot="statement" aria-hidden="true" />
      <div className="statement__grid">
        <div className="statement__copy">
          <SplitHeading id="intro-title" className="kicker-head" text={title} />
          <p ref={textRef} className="statement__text" aria-label={text}>
            <span aria-hidden="true">
              {words.map((w, i) => (
                <ReadWord key={i} word={w} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} reduce={reduce} />
              ))}
            </span>
          </p>
          <Reveal as="ul" className="stats">
            {STATS.map((s) => (
              <RevealItem as="li" key={s.label} className="stat">
                <span className="stat__n"><CountUp to={s.n} suffix={s.suffix} /></span>
                <span className="sr-only">{s.n}{s.suffix} </span>
                <span className="stat__label">{s.label}</span>
              </RevealItem>
            ))}
          </Reveal>
          <Reveal>
            <RevealItem as="p" className="statement__note muted">{note}</RevealItem>
          </Reveal>
        </div>
        <motion.figure
          ref={photoRef}
          className="statement__photo"
          initial={reduce ? false : { clipPath: "inset(12% 12% 12% 12% round 22px)", opacity: 0.4 }}
          whileInView={{ clipPath: "inset(0% 0% 0% 0% round 22px)", opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <motion.div className="statement__img" style={reduce ? undefined : { y: photoY }}>
            <Image src={img} alt={alt} width={1600} height={1000} sizes="(max-width: 820px) 92vw, 34vw" style={{ objectPosition: "85% 50%" }} />
          </motion.div>
        </motion.figure>
      </div>
    </section>
  );
}

/* ------------------------------ how to take it ------------------------------ */

const DAYS = ["Day 1", "Day 7", "Day 30"];

export function HowSteps({ title, steps }: { title: string; steps: { title: string; text: string }[] }) {
  const reduce = useReduce();
  const { flavours, look } = useFlavour();
  const [hovered, setHovered] = useState(-1);
  const track = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ["start 80%", "end 60%"] });
  const line = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.4 });

  return (
    <section id="how" className="sec how" aria-labelledby="how-title" tabIndex={-1}>
      <div className="how__top">
        <SplitHeading id="how-title" className="poster how__head" text={title} />
        <p className="how__sub muted">Three moments, one habit. The tub does the rest.</p>
      </div>
      <div className="how__track" aria-hidden="true">
        <motion.span className="how__line" style={reduce ? { scaleX: 1 } : { scaleX: line }} />
      </div>
      <div ref={track}>
        <Reveal as="ol" className="how__cards">
          {steps.map((h, i) => (
            <RevealItem
              as="li"
              key={i}
              className="how__card"
              style={{ ["--card" as string]: look(flavours[i % flavours.length]).ground }}
              onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(i)}
              onPointerLeave={() => setHovered(-1)}
            >
              <span className="how__dot" aria-hidden="true" />
              <div className="how__panel">
                <span className="how__badge">{DAYS[i] ?? `Step ${i + 1}`}</span>
                <span className="how__num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                {(() => {
                  const Icon = STEP_ICONS[i % STEP_ICONS.length];
                  return <Icon active={hovered === i} />;
                })()}
              </div>
              <h3>{h.title}</h3>
              <p>{h.text}</p>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------ checkout total ------------------------------ */

/** The order total, sliding up to each new value. */
export function AnimatedAmount({ value }: { value: string }) {
  const reduce = useReduce();
  return (
    <span className="amount amount--anim" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={reduce ? false : { y: "60%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1, transition: { duration: 0.35, ease: EASE } }}
          exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { y: "-60%", opacity: 0, transition: { duration: 0.2 } }}
          style={{ display: "inline-block" }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------ closing band ------------------------------ */

function Magnetic({ children, href, className }: { children: React.ReactNode; href: string; className: string }) {
  const reduce = useReduce();
  const x = useMotionValue(0), y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18 }), sy = useSpring(y, { stiffness: 260, damping: 18 });
  return (
    <motion.a
      href={href}
      className={className}
      style={reduce ? undefined : { x: sx, y: sy }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * 0.25);
        y.set((e.clientY - r.top - r.height / 2) * 0.35);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
      whileTap={reduce ? undefined : { scale: 0.96 }}
    >
      {children}
    </motion.a>
  );
}

export function CloseBand({ title, text, cta }: { title: string; text: string; cta: string }) {
  const reduce = useReduce();
  const { flavours, look } = useFlavour();
  const ticker = [...flavours, "30 scoops", "One month", ...flavours, "Ships across Canada"];

  return (
    <section className="close on-dark" aria-labelledby="close-title">
      <div className="ticker" aria-hidden="true">
        <motion.div
          className="ticker__row"
          animate={reduce ? undefined : { x: ["0%", "-50%"] }}
          transition={{ duration: 28, ease: "linear", repeat: Infinity }}
        >
          {[0, 1].map((k) => (
            <span key={k} className="ticker__set">
              {ticker.map((t, i) => (
                <span key={i} className="ticker__item">
                  <i style={{ background: look(t).lid }} />
                  {t}
                </span>
              ))}
            </span>
          ))}
        </motion.div>
      </div>

      <div className="close__body">
        <SplitHeading id="close-title" className="poster close__head" text={title} />
        <div className="close__ring" aria-hidden="true">
          <motion.svg
            viewBox="0 0 200 200"
            animate={reduce ? undefined : { rotate: 360 }}
            transition={{ duration: 24, ease: "linear", repeat: Infinity }}
          >
            <defs><path id="ring-path" d="M100 100 m-78 0 a78 78 0 1 1 156 0 a78 78 0 1 1 -156 0" /></defs>
            <text><textPath href="#ring-path" startOffset="0">ONE TUB · THIRTY SCOOPS · ONE MONTH · ONE TUB · THIRTY SCOOPS · ONE MONTH ·</textPath></text>
          </motion.svg>
          <span
            className="close__core"
            style={{
              background: `conic-gradient(${flavours
                .map((f, i) => `${look(f).lid} ${(i / flavours.length) * 100}% ${((i + 1) / flavours.length) * 100}%`)
                .join(", ")})`,
            }}
          >
            <b>No.3</b>
          </span>
        </div>
      </div>

      <div className="close__foot">
        <p>{text}</p>
        <Magnetic href="#buy" className="btn btn--light close__cta">
          {cta} <span className="arrow" aria-hidden="true">→</span>
        </Magnetic>
      </div>
    </section>
  );
}

/* ------------------------------ footer wordmark ------------------------------ */

export function FootMark() {
  const reduce = useReduce();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const y = useTransform(scrollYProgress, [0, 1], ["45%", "0%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [0.2, 1]);
  return (
    <div ref={ref} className="foot__mark">
      <motion.div style={reduce ? undefined : { y, opacity }}>
        <WordSvg letters={BR3THR} title="BR3THR" />
      </motion.div>
    </div>
  );
}
