"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { MotionConfig } from "framer-motion";

/*
 * The flavour the visitor is looking at, shared by the hero carousel, the
 * pinned "inside" scene and the buy panel: picking Black cherry in the hero
 * means the checkout opens on Black cherry too, and the other way round.
 *
 * Each flavour owns a ground colour (the page behind the tub) chosen so black
 * text keeps at least 6:1 contrast on it, and a deeper tone for accents.
 */
export const FLAVOUR_THEME: Record<string, { ground: string; deep: string; bit: string }> = {
  Unflavoured: { ground: "#d9d5cc", deep: "#8f897c", bit: "#f4f2ec" },
  "Black cherry": { ground: "#cf8f99", deep: "#6b1828", bit: "#5a1020" },
  "Citrus salt": { ground: "#dccf5f", deep: "#8a7d12", bit: "#f2ea9a" },
};
const FALLBACK = { ground: "#d9d5cc", deep: "#8f897c", bit: "#f4f2ec" };
export const themeOf = (f: string) => FLAVOUR_THEME[f] ?? FALLBACK;

type Ctx = {
  flavours: string[];
  index: number;
  flavour: string;
  /** -1 or 1: which way the last change went, for direction-aware motion. */
  dir: number;
  go: (delta: number) => void;
  setFlavour: (f: string) => void;
};

const FlavourCtx = createContext<Ctx | null>(null);

export function FlavourProvider({
  flavours,
  initial,
  children,
}: {
  flavours: string[];
  initial?: string;
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

  const value = useMemo(
    () => ({ flavours: list, index: state.index, flavour: list[state.index], dir: state.dir, go, setFlavour }),
    [list, state, go, setFlavour],
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
