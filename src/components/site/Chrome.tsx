"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { WordSvg, BR3THR } from "./Wordmark";
import { useReduce } from "./Reveal";

/**
 * Top bar: wordmark, section links, sign in, one action. It sits clear over
 * the hero, takes a frosted ground once the page moves, slides away while
 * scrolling down and comes back on the way up.
 */
export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  const reduce = useReduce();
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => {
    setSolid(y > 24);
    setHidden(y > last.current && y > 480 && !open);
    last.current = y;
  });
  return (
    <motion.header
      className="site-head"
      data-solid={solid || open}
      initial={reduce ? false : { y: "-110%" }}
      animate={{ y: hidden ? "-110%" : "0%" }}
      transition={{ duration: hidden ? 0.35 : 0.6, ease: [0.22, 0.9, 0.24, 1] }}
    >
      <Link className="mark" href="/" aria-label="BR3THR home">
        <WordSvg letters={BR3THR} />
      </Link>
      <button
        type="button"
        className="btn menu-btn"
        aria-expanded={open}
        aria-controls="site-nav"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Close" : "Menu"}
      </button>
      <nav id="site-nav" aria-label="Main" data-open={open} onClick={() => setOpen(false)}>
        <Link href="/#inside">Inside</Link>
        <Link href="/#how">How to</Link>
        <Link href="/#faq">Questions</Link>
        <Link href="/track-order">Track order</Link>
        <Link href={signedIn ? "/account" : "/account/login"}>{signedIn ? "Account" : "Sign in"}</Link>
      </nav>
      <Link className="btn" href="/#buy">Buy</Link>
    </motion.header>
  );
}

/** A slim bar that offers the purchase once the first screen has gone and until the buy section shows. */
export function BuyBar({ price }: { price: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.querySelector(".hero");
    const buy = document.getElementById("buy");
    // The close and the footer carry their own buy button; the bar steps aside there too.
    const ends = [document.querySelector(".close"), document.querySelector(".foot")].filter(Boolean) as Element[];
    if (!hero || !buy) return;
    let pastHero = false, atBuy = false;
    const atEnd = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) pastHero = !e.isIntersecting && e.boundingClientRect.top < 0;
        else if (e.target === buy) atBuy = e.isIntersecting;
        else if (e.isIntersecting) atEnd.add(e.target);
        else atEnd.delete(e.target);
      }
      setShow(pastHero && !atBuy && atEnd.size === 0);
    });
    io.observe(hero);
    io.observe(buy);
    ends.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <div className="buybar on-dark" data-show={show} aria-hidden={!show}>
      <span>
        <strong>No.3 Daily Blend</strong> <span className="muted-dark">· from {price}</span>
      </span>
      <a className="btn btn--light" href="#buy" tabIndex={show ? 0 : -1}>Buy</a>
    </div>
  );
}
