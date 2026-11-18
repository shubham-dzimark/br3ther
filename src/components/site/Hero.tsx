"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { TubScene, type TubController } from "./TubScene";

/*
 * The first screen and the signature move.
 *
 * The name is the monument: BR · [tub] · THR across the full width, the tub
 * standing exactly where the 3 is. Scrolling holds the screen while the letters
 * part, the tub lifts out of the name, turns and opens its lid, and the four
 * facts of the tub come up around it. Without motion it is simply the first
 * screen, complete.
 */
export function Hero({ price }: { price: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLSpanElement>(null);
  const tubBox = useRef<HTMLDivElement>(null);
  const tub = useRef<TubController | null>(null);

  useEffect(() => {
    const st = stage.current, sl = slot.current, box = tubBox.current;
    if (!st || !sl || !box) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const narrowNow = () => window.matchMedia("(max-width: 760px)").matches;

    /*
     * The box is drawn at the size the tub reaches at the end of the scene, so
     * the canvas renders sharp, and is scaled DOWN to stand in the slot, where
     * the tub is about one capital tall. The scene then only scales it up to 1.
     */
    let slotScale = 1;
    const place = () => {
      const s = st.getBoundingClientRect();
      const r = sl.getBoundingClientRect();
      const slotSide = r.height * 1.95;
      const big = reduce ? slotSide : st.clientHeight * (narrowNow() ? 0.48 : 0.76);
      slotScale = slotSide / big;
      box.style.width = `${big}px`;
      box.style.height = `${big}px`;
      box.style.left = `${r.left - s.left + r.width / 2 - big / 2}px`;
      box.style.top = `${r.top - s.top + r.height / 2 - big / 2 - r.height * 0.02}px`;
      box.style.transformOrigin = "50% 50%";
      // xPercent/yPercent clear the no-script centring in the stylesheet.
      gsap.set(box, { xPercent: 0, yPercent: 0, x: 0, y: 0, scale: slotScale });
    };
    place();

    if (reduce) {
      const ro = new ResizeObserver(place);
      ro.observe(st);
      return () => ro.disconnect();
    }

    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add({ wide: "(min-width: 761px)", narrow: "(max-width: 760px)" }, () => {
      const left = st.querySelector(".part--l"), right = st.querySelector(".part--r");
      const foot = st.querySelector(".hero__foot");
      const callouts = st.querySelectorAll(".callout");
      const title = st.querySelector(".hero__scenetitle");
      place();

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: st,
          start: "top top",
          end: narrowNow() ? "+=130%" : "+=170%",
          pin: true,
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onRefreshInit: () => { gsap.set(box, { x: 0, y: 0 }); place(); },
          onUpdate: (self) => tub.current?.setProgress(Math.max(0, (self.progress - 0.25) / 0.75)),
        },
      });
      // The ground turns to studio grey as the tub leaves the name: a backdrop for the product.
      tl.to(st, { backgroundColor: "#ececea", duration: 0.3 }, 0.02)
        .to(foot, { opacity: 0, y: 24, duration: 0.15 }, 0)
        .to(left, { xPercent: -70, autoAlpha: 0, duration: 0.3 }, 0.02)
        .to(right, { xPercent: 70, autoAlpha: 0, duration: 0.3 }, 0.02)
        .to(
          box,
          {
            duration: 0.35,
            // From the slot to the middle of the screen, at full size.
            x: () => st.clientWidth / 2 - (box.offsetLeft + box.offsetWidth / 2),
            y: () => st.clientHeight * (narrowNow() ? 0.52 : 0.58) - (box.offsetTop + box.offsetHeight / 2),
            scale: 1,
          },
          0.02,
        )
        .to(title, { opacity: 1, duration: 0.12 }, 0.32)
        .to(callouts, { opacity: 1, y: 0, stagger: 0.1, duration: 0.12 }, 0.45)
        .to({}, { duration: 0.15 });
      gsap.set(callouts, { y: 20 });

      // A short entrance on load: the letters rise, the tub settles in. These
      // move the inner shapes, never the parts the scroll timeline owns.
      const letters = st.querySelectorAll(".hero__name .ink");
      gsap.from(letters, { yPercent: 22, opacity: 0, duration: 1.1, ease: "power4.out", stagger: 0.06, delay: 0.1 });
      if (box.firstElementChild) {
        gsap.from(box.firstElementChild, { opacity: 0, yPercent: 8, duration: 1.3, ease: "power4.out", delay: 0.3 });
      }
    });

    return () => mm.revert();
  }, []);

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__stage" ref={stage}>
        <h1 id="hero-title" className="hero__name" aria-label="BR3THR, No.3 Daily Blend">
          <span className="part part--l">
            <span className="ink">BR</span>
          </span>
          <span className="hero__slot" ref={slot} aria-hidden="true" />
          <span className="part part--r">
            <span className="ink">THR</span>
          </span>
        </h1>

        <div className="hero__tub" ref={tubBox}>
          <TubScene controllerRef={tub} className="hero__tubcanvas" />
        </div>

        <p className="hero__scenetitle h2" aria-hidden="true">The tub, taken apart</p>
        <ul className="hero__callouts" aria-label="The tub in four facts">
          <li className="callout"><b>300 g</b>in every tub, sealed under the lid</li>
          <li className="callout"><b>30</b>scoops, one a day, one month</li>
          <li className="callout"><b>10 g</b>measured scoop, packed inside</li>
          <li className="callout"><b>¼ turn</b>to close the lid tight again</li>
        </ul>

        <div className="hero__foot">
          <p className="hero__lede">No.3 Daily Blend, a daily supplement. One tub, thirty scoops, one month.</p>
          <div className="hero__cta">
            <span className="price">{price}</span>
            <a className="btn" href="#buy">
              Buy No.3 <span className="arrow" aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
