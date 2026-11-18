"""Br3thr logo concepts, round 2: combination marks with a symbol.

1. Linked 3  - the 3 is two interlocked chain links (a bond that holds).
2. Heart 3   - a heart whose lobes are a 3 on its side (<3).
3. Proof Seal - a round stamp: BR3THR on the rim, the squared 3 inside,
                ringed by the admin theme's red wax pencil.
Run: python build_concepts_v2.py
"""
import math
from pathlib import Path

from build_concepts import B, R, T, H, THREE  # caps glyphs, cap height 120

OUT = Path(__file__).parent / "concepts-v2"
OUT.mkdir(exist_ok=True)
INK = "#0B0B0B"
MARK = "#D2402B"


def pt(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def arc(cx, cy, r, a0, a1):
    """SVG arc path from angle a0 to a1 (degrees, clockwise on screen)."""
    x0, y0 = pt(cx, cy, r, a0)
    x1, y1 = pt(cx, cy, r, a1)
    large = 1 if (a1 - a0) % 360 > 180 else 0
    return f"M{x0:.2f},{y0:.2f} A{r},{r} 0 {large} 1 {x1:.2f},{y1:.2f}"


def link3(cx, top, r, d, sw, colour=INK):
    """Two left-open loops stacked d apart; upper passes over on the right,
    lower passes over on the left. Gaps are cut where a loop goes under."""
    cu, cl = top + sw / 2 + r, top + sw / 2 + r + d
    half = d / 2
    dx = math.sqrt(r * r - half * half)
    ang_r = math.degrees(math.atan2(half, dx))           # upper loop, right crossing
    ang_l = 180 - ang_r                                   # upper loop, left crossing
    gap = math.degrees((sw / 2 + sw * 0.32) / r)          # half-width of an under-gap
    open_a, open_b = 210, 150 + 360                       # open on the left (150..210)
    seg = []
    # upper loop: from the open end, round the top and right, under at the left crossing
    seg.append(("round", arc(cx, cu, r, open_a, ang_l + 360 - gap)))
    # lower loop: under at the right-top crossing, over everywhere else
    lr = 360 - ang_r  # lower loop's right-top crossing
    seg.append(("round", arc(cx, cl, r, open_a, lr - gap)))
    seg.append(("butt", arc(cx, cl, r, lr + gap, open_b)))
    out = ""
    for cap, d_ in seg:
        out += (f'<path d="{d_}" fill="none" stroke="{colour}" stroke-width="{sw}" '
                f'stroke-linecap="{cap}"/>')
    return out


def doc(view, body, title="Br3thr logo"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}">'
            f'<title>{title}</title>{body}</svg>\n')


def caps(*glyphs):
    return f'<g fill="{INK}">{"".join(glyphs)}</g>'


# ---------------- 1. Linked 3 ----------------
(OUT / "1-symbol.svg").write_text(doc("0 0 256 256", link3(112, 39, 48, 60, 22)))
# wordmark: BR + linked 3 at cap height + THR (stroke 24 to match the caps)
wm1 = caps(B(0), R(104)) + link3(238, -2, 30, 36, 20) + caps(T(296), H(396), R(500))
(OUT / "1-lockup.svg").write_text(doc("-24 -68 644 256", wm1))

# ---------------- 2. Heart 3 (<3) ----------------
heart = (f'<g fill="none" stroke="{INK}" stroke-width="26" stroke-linecap="round" '
         f'stroke-linejoin="round">'
         f'<path d="M128,212 L50,112 A40,40 0 0 1 128,100 A40,40 0 0 1 206,112 Z"/>'
         f'<path d="M128,100 V132"/></g>')
(OUT / "2-symbol.svg").write_text(doc("0 0 256 256", heart))
lock2 = (f'<g transform="translate(-6,-36) scale(0.75)">{heart}</g>'
         f'<g transform="translate(200,0)">{caps(B(0), R(104), THREE(206), T(302), H(402), R(506))}</g>')
(OUT / "2-lockup.svg").write_text(doc("-24 -68 850 256", lock2))

# ---------------- 3. Proof Seal ----------------
ring_text = "BR3THR · BR3THR · BR3THR · "
seal = (
    f'<circle cx="128" cy="128" r="112" fill="none" stroke="{INK}" stroke-width="8"/>'
    f'<circle cx="128" cy="128" r="78" fill="none" stroke="{INK}" stroke-width="4"/>'
    f'<defs><path id="rim" d="M128,128 m-95,0 a95,95 0 1 1 190,0 a95,95 0 1 1 -190,0"/></defs>'
    f'<text font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="22" '
    f'letter-spacing="3" fill="{INK}"><textPath href="#rim">{ring_text}</textPath></text>'
    f'<g fill="{INK}" transform="translate(98,86) scale(0.7)">{THREE(0)}</g>'
)
seal_mark = (f'<path d="M86,176 C70,150 74,96 112,80 C150,66 186,84 186,124 '
             f'C186,166 150,186 112,180 C96,177 88,170 84,160" fill="none" stroke="{MARK}" '
             f'stroke-width="7" stroke-linecap="round"/>')
(OUT / "3-symbol.svg").write_text(doc("0 0 256 256", seal))
(OUT / "3-symbol-colour.svg").write_text(doc("0 0 256 256", seal + seal_mark))
lock3 = (f'<g transform="translate(-10,-38) scale(0.82)">{seal}</g>'
         f'<g transform="translate(230,0)">{caps(B(0), R(104), THREE(206), T(302), H(402), R(506))}</g>')
(OUT / "3-lockup.svg").write_text(doc("-24 -68 880 256", lock3))

print("written:", ", ".join(p.name for p in sorted(OUT.glob("*.svg"))))


# ---------------- 1 (replacement). Twin Halves ----------------
def twin3(x, top_fill=INK, bottom_fill=INK):
    """The squared 3 as two identical bracket halves, one flipped, slit apart."""
    top = f'<path fill="{top_fill}" d="M{x},0 H{x+82} V56 H{x+14} V42 H{x+58} V24 H{x} Z"/>'
    bot = f'<path fill="{bottom_fill}" d="M{x},120 H{x+82} V64 H{x+14} V78 H{x+58} V96 H{x} Z"/>'
    return top + bot

(OUT / "1-symbol.svg").write_text(doc("0 0 256 256", f'<g transform="translate(71,44) scale(1.4)">{twin3(0)}</g>'))
(OUT / "1-symbol-colour.svg").write_text(doc("0 0 256 256", f'<g transform="translate(71,44) scale(1.4)">{twin3(0, INK, MARK)}</g>'))
wm_t = caps(B(0), R(104)) + twin3(206) + caps(T(302), H(402), R(506))
(OUT / "1-lockup.svg").write_text(doc("-24 -68 650 256", wm_t))
print("twin halves written")
