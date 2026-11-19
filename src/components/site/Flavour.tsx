"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { MotionConfig } from "framer-motion";

/*
 * The flavour the visitor is looking at, shared by the hero carousel, the
 * pinned "inside" scene and the buy panel: picking Black cherry in the hero
 * means the checkout opens on Black cherry too, and the other way round.
 *
 * Each flavour's colours (the ground behind the tub and the lid) are set in
 * Admin > Home Page Control and passed in from the server as `looks`.
 */
export type Look = { ground: string; lid: string };
const NEUTRAL: Look = { ground: "#d9d5cc", lid: "#ecece8" };

type Ctx = {
  flavours: string[];
  index: number;
  flavour: string;
  /** -1 or 1: which way the last change went, for direction-aware motion. */
  dir: number;
  go: (delta: number) => void;
  setFlavour: (f: string) => void;
  /** The colours a flavour is shown in. */
  look: (f: string) => Look;
};

const FlavourCtx = createContext<Ctx | null>(null);

export function FlavourProvider({
  flavours,
  initial,
  looks = {},
  children,
}: {
  flavours: string[];
  initial?: string;
  looks?: Record<string, Look>;
  children: React.ReactNode;
}) {
  const key = flavours.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const list = useMemo(() => (flavours.length ? flavours : ["Unflavoured"]), [key]);
  const [state, setState] = useState(() => ({ index: Math.max(0, list.indexOf(initial ?? "")), dir: 1 }));

  const go = useCallback(
    (delta: number) =>
      setState((s) => ({ index: (s.index + delta + list.length * 8) % list.length, dir: delta < 0 ? -1 : 1 })),
    [list.length],
  );
  const setFlavour = useCallback(
    (f: string) =>
      setState((s) => {
        const i = list.indexOf(f);
        if (i < 0 || i === s.index) return s;
        return { index: i, dir: i < s.index ? -1 : 1 };
      }),
    [list],
  );

  const looksKey = JSON.stringify(looks);
  const look = useCallback(
    (f: string) => looks[f] ?? NEUTRAL,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [looksKey],
  );
  const value = useMemo(
    () => ({ flavours: list, index: state.index, flavour: list[state.index], dir: state.dir, go, setFlavour, look }),
    [list, state, go, setFlavour, look],
  );
  return (
    <MotionConfig reducedMotion="user">
      <FlavourCtx.Provider value={value}>{children}</FlavourCtx.Provider>
    </MotionConfig>
  );
}

export function useFlavour(): Ctx {
  const ctx = useContext(FlavourCtx);
  if (!ctx) throw new Error("useFlavour must be used inside <FlavourProvider>");
  return ctx;
}
