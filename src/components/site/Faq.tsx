"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE, Reveal, RevealItem, useReduce } from "./Reveal";

/*
 * The homepage questions as an accordion: numbered rows split by hairlines, a
 * round plus that turns into a cross, and answers that slide open with Framer
 * Motion. Each row is a real button with aria-expanded controlling its answer
 * region, so keyboards and screen readers get the state. Several can be open
 * at once; the first starts open so the section never looks empty.
 */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const reduce = useReduce();
  const base = useId();
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const toggle = (i: number) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <Reveal as="ol" className="faq__list">
      {items.map(({ q, a }, i) => {
        const isOpen = open.has(i);
        const btn = `${base}-q${i}`;
        const panel = `${base}-a${i}`;
        return (
          <RevealItem as="li" key={q} className="faq__item" data-open={isOpen}>
            <h3 className="faq__q">
              <button id={btn} type="button" aria-expanded={isOpen} aria-controls={panel} onClick={() => toggle(i)}>
                <span className="faq__num" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <span className="faq__text">{q}</span>
                <motion.span
                  className="faq__icon"
                  aria-hidden="true"
                  animate={{ rotate: isOpen ? 45 : 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                >
                  <svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </motion.span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  id={panel}
                  role="region"
                  aria-labelledby={btn}
                  className="faq__a"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1, transition: { duration: reduce ? 0 : 0.45, ease: EASE } }}
                  exit={{ height: 0, opacity: 0, transition: { duration: reduce ? 0 : 0.28, ease: [0.4, 0, 1, 1] } }}
                >
                  <p>{a}</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </RevealItem>
        );
      })}
    </Reveal>
  );
}
