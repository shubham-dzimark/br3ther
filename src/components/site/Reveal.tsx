"use client";

import { Fragment, useSyncExternalStore } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

/*
 * Scroll entrances with Framer Motion. Each runs once, when a quarter of the
 * block is on screen, and only moves transform and opacity. With reduced
 * motion everything renders in its final state.
 */
export const EASE = [0.22, 1, 0.36, 1] as const;

const noop = () => () => {};
/**
 * The visitor's reduced-motion setting, but false during server rendering and
 * hydration so the first client render matches the HTML; it switches to the
 * real value right after. <MotionConfig reducedMotion="user"> (in the flavour
 * provider) keeps transform animations instant meanwhile.
 */
export function useReduce(): boolean {
  const pref = useReducedMotion();
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  return hydrated ? Boolean(pref) : false;
}

const group: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.08 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 28 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
};

/** A block whose <RevealItem> children come in one after another. */
export function Reveal({
  children,
  className,
  as = "div",
  ...rest
}: { children: React.ReactNode; className?: string; as?: "div" | "ul" | "ol" } & React.HTMLAttributes<HTMLElement>) {
  const reduce = useReduce();
  const Tag = motion[as] as typeof motion.div;
  return (
    <Tag
      className={className}
      variants={group}
      initial={reduce ? false : "hidden"}
      whileInView="shown"
      viewport={{ once: true, amount: 0.25 }}
      {...(rest as object)}
    >
      {children}
    </Tag>
  );
}

export function RevealItem({
  children,
  className,
  as = "div",
  ...rest
}: { children: React.ReactNode; className?: string; as?: "div" | "li" | "p" | "figure" } & React.HTMLAttributes<HTMLElement>) {
  const Tag = motion[as] as typeof motion.div;
  return (
    <Tag className={className} variants={item} {...(rest as object)}>
      {children}
    </Tag>
  );
}

/**
 * A heading that rises in word by word from behind a mask. The heading keeps
 * its whole text as its accessible name; the moving words are hidden from it.
 */
export function SplitHeading({
  text,
  as = "h2",
  className,
  id,
}: {
  text: string;
  as?: "h1" | "h2" | "h3";
  className?: string;
  id?: string;
}) {
  const reduce = useReduce();
  const Tag = as;
  const words = text.split(" ");
  return (
    <Tag id={id} className={className} aria-label={text}>
      <motion.span
        aria-hidden="true"
        style={{ display: "block" }}
        initial={reduce ? false : "hidden"}
        whileInView="shown"
        viewport={{ once: true, amount: 0.5 }}
        transition={{ staggerChildren: 0.06 }}
      >
        {words.map((w, i) => (
          <Fragment key={i}>
            <span className="mask">
              <motion.span
                className="mask__in"
                variants={{ hidden: { y: "110%" }, shown: { y: "0%", transition: { duration: 0.9, ease: EASE } } }}
              >
                {w}
              </motion.span>
            </span>
            {i < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </motion.span>
    </Tag>
  );
}
