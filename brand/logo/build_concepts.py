"""Builds the three Br3thr logo concepts as clean SVGs (black on white).

Grid: cap height 120 units, stroke 24 units, letters built from rectangles,
semicircle arcs and straight diagonals. Run: python build_concepts.py
"""
from pathlib import Path

OUT = Path(__file__).parent / "concepts"
OUT.mkdir(exist_ok=True)

INK = "#0B0B0B"

# ---- caps glyphs at origin, cap height 120 -------------------------------
def B(x):
    # outer: stem + top bowl (r28) + larger bottom bowl (r32); counters as holes
    return (f'<path fill-rule="evenodd" d="M{x},0 H{x+52} A28,28 0 0 1 {x+52},56 H{x+58} '
            f'A32,32 0 0 1 {x+58},120 H{x} Z '
            f'M{x+24},24 H{x+45} A10.5,10.5 0 0 1 {x+45},45 H{x+24} Z '
            f'M{x+24},67 H{x+52} A14.5,14.5 0 0 1 {x+52},96 H{x+24} Z"/>')

def R(x):
    return (f'<path fill-rule="evenodd" d="M{x},0 H{x+50} A33,33 0 0 1 {x+50},66 H{x+24} V120 H{x} Z '
            f'M{x+24},24 H{x+50} A9,9 0 0 1 {x+50},42 H{x+24} Z"/>'
            f'<path d="M{x+44},60 H{x+70} L{x+96},120 H{x+70} Z"/>')

def THREE(x):
    # squared 3 = mirrored E: three bars and a right-hand stem
    return (f'<path d="M{x},0 H{x+82} V120 H{x} V96 H{x+58} V72 H{x+14} V48 H{x+58} V24 H{x} Z"/>')

def T(x):
    return f'<path d="M{x},0 H{x+88} V24 H{x+56} V120 H{x+32} V24 H{x} Z"/>'

def H(x):
    return (f'<path d="M{x},0 H{x+24} V48 H{x+64} V0 H{x+88} V120 H{x+64} V72 H{x+24} V120 H{x} Z"/>')

def wordmark_paths(dx=0, dy=0):
    # optical spacing: open shapes (R leg, T arms) get tighter gaps
    xs = {"B": 0, "R1": 104, "3": 206, "T": 302, "H": 402, "R2": 506}
    body = B(xs["B"]) + R(xs["R1"]) + THREE(xs["3"]) + T(xs["T"]) + H(xs["H"]) + R(xs["R2"])
    return f'<g transform="translate({dx},{dy})">{body}</g>', 602

def svg(view, body, fill=INK):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}"><title>Br3thr logo</title>'
            f'<g fill="{fill}">{body}</g></svg>\n')

# ---- A: Mirror E wordmark -------------------------------------------------
wm, w = wordmark_paths()
(OUT / "a-wordmark.svg").write_text(svg(f"-24 -68 {w+48} 256", wm))
# symbol for A: the 3 alone, centred on 256
(OUT / "a-symbol.svg").write_text(svg("0 0 256 256", f'<g transform="translate(76,52) scale(1.267)">{THREE(0)}</g>'))

# ---- B: Shared Spine monogram (3 and B back to back on one stem) ----------
def spine_symbol():
    # bars to the left of a shared stem, B bowls to the right; height 120 at y 68
    bars = (f'<path d="M0,0 H82 V120 H0 V96 H58 V72 H14 V48 H58 V24 H0 Z"/>')
    bowls = B(58)  # B stem sits on the 3's stem (58..82)
    return bars + bowls  # total width 58+90 = 148

sym = spine_symbol()
(OUT / "b-symbol.svg").write_text(svg("0 0 256 256", f'<g transform="translate(19.5,40) scale(1.467)">{sym}</g>'))
wm2, w2 = wordmark_paths(dx=200)
(OUT / "b-lockup.svg").write_text(svg(f"-24 -68 {200+w2+48} 256", f'{sym}{wm2}'))

# ---- C: monoline lowercase br3thr (strokes; outline before final) ---------
stroke = f'fill="none" stroke="{INK}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"'
c_body = (
    f'<g {stroke}>'
    '<path d="M10,8 V112"/><circle cx="44" cy="84" r="30"/>'                       # b
    '<path d="M104,112 V80 A26,26 0 0 1 130,54 H140"/>'                            # r
    '<path d="M166,60 A24,22 0 1 1 188,90 A26,24 0 1 1 164,122"/>'                 # 3
    '<path d="M236,26 V102 A12,12 0 0 0 248,114 H258 M222,58 H256"/>'              # t
    '<path d="M284,8 V112 M284,80 A28,28 0 0 1 340,80 V112"/>'                     # h
    '<path d="M370,112 V80 A26,26 0 0 1 396,54 H406"/>'                            # r
    '</g>'
)
(OUT / "c-wordmark.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-24 -55 454 256">{c_body}</svg>\n')
(OUT / "c-symbol.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><g transform="translate(54,40) scale(1.25)">'
    f'<g {stroke}><path d="M10,8 V112"/><circle cx="44" cy="84" r="30"/>'
    '<path d="M104,60 A24,22 0 1 1 126,90 A26,24 0 1 1 102,122"/></g></g></svg>\n')

print("written:", ", ".join(p.name for p in sorted(OUT.glob("*.svg"))))
