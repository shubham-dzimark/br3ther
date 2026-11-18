"""Br3thr final logo kit masters (Proof Seal + small icon + wordmark).

All letterforms are constructed paths (no fonts). Run: python build_final.py
"""
import math
from pathlib import Path

from build_concepts import B, R, T, H, THREE

OUT = Path(__file__).parent / "final"
OUT.mkdir(exist_ok=True)
INK, WHITE, MARK = "#0B0B0B", "#FFFFFF", "#D2402B"

GLYPHS = [("B", B, 90), ("R", R, 96), ("3", THREE, 82), ("T", T, 88), ("H", H, 88), ("R", R, 96)]
GAP = 16          # letter gap in glyph units
CX = CY = 128


def rim(ink, words=3, s=0.19, r_out=111):
    """BR3THR repeated round the rim, dots between words. Letters stand on a
    circle, tops outward, reading clockwise."""
    word = sum(w for _, _, w in GLYPHS) + GAP * (len(GLYPHS) - 1)
    unit_dot = 70
    total = (word + unit_dot) * words
    r_mid = r_out - 60 * s                     # mid-height radius of the letters
    deg_per_unit = 360 / total
    out, a = [], 0.0
    for _ in range(words):
        for _, fn, w in GLYPHS:
            centre = a + (w / 2) * deg_per_unit
            out.append(f'<g transform="translate({CX},{CY}) rotate({centre:.3f}) '
                       f'translate({-w * s / 2:.2f},{-r_out}) scale({s})">{fn(0)}</g>')
            a += (w + GAP) * deg_per_unit
        a -= GAP * deg_per_unit
        dot_a = math.radians(a + unit_dot / 2 * deg_per_unit - 90)
        out.append(f'<circle cx="{CX + r_mid * math.cos(dot_a):.2f}" cy="{CY + r_mid * math.sin(dot_a):.2f}" r="3.2"/>')
        a += unit_dot * deg_per_unit
    return f'<g fill="{ink}">{"".join(out)}</g>'


def wax_loop(colour, width=7):
    # one hand-drawn china-marker loop round the 3, its tail crossing at lower left
    return (f'<path d="M84,170 C68,146 72,94 110,80 C150,66 184,86 184,126 '
            f'C184,166 148,186 110,180 C94,177 86,168 80,156" fill="none" stroke="{colour}" '
            f'stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>')


def seal(ink, mark):
    return (f'<circle cx="128" cy="128" r="122" fill="none" stroke="{ink}" stroke-width="7"/>'
            f'<circle cx="128" cy="128" r="80" fill="none" stroke="{ink}" stroke-width="3.5"/>'
            f'{rim(ink)}'
            f'<g fill="{ink}" transform="translate(97,83) scale(0.75)">{THREE(0)}</g>')


def icon(ink, mark, tile=None):
    """Small sizes: the squared 3 alone, optionally on a black tile."""
    bg = f'<rect width="256" height="256" rx="56" fill="{tile}"/>' if tile else ""
    return f'{bg}<g fill="{ink}" transform="translate(76,52) scale(1.267)">{THREE(0)}</g>'


def wordmark(ink):
    return (f'<g fill="{ink}">{B(0)}{R(104)}{THREE(206)}{T(302)}{H(402)}{R(506)}</g>')


def doc(view, body, title="Br3thr"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}">'
            f'<title>{title}</title>{body}</svg>\n')


files = {
    "br3thr-seal.svg": doc("0 0 256 256", seal(INK, MARK), "Br3thr seal"),
    "br3thr-seal-reversed.svg": doc("0 0 256 256", seal(WHITE, MARK), "Br3thr seal"),
    "br3thr-icon.svg": doc("0 0 256 256", icon(WHITE, MARK, INK), "Br3thr icon"),
    "br3thr-icon-plain.svg": doc("0 0 256 256", icon(INK, MARK), "Br3thr icon"),
    "br3thr-icon-reversed.svg": doc("0 0 256 256", icon(WHITE, MARK), "Br3thr icon"),
    "br3thr-wordmark.svg": doc("-24 -68 650 256", wordmark(INK), "Br3thr"),
    "br3thr-wordmark-reversed.svg": doc("-24 -68 650 256", wordmark(WHITE), "Br3thr"),
    # horizontal lockup: seal at cap-height x 2, wordmark beside it
    "br3thr-lockup.svg": doc("-24 -68 900 256",
                            f'<g transform="translate(-12,-36) scale(0.75)">{seal(INK, MARK)}</g>'
                            f'<g transform="translate(232,0)">{wordmark(INK)}</g>', "Br3thr"),
    "br3thr-lockup-reversed.svg": doc("-24 -68 900 256",
                                     f'<g transform="translate(-12,-36) scale(0.75)">{seal(WHITE, MARK)}</g>'
                                     f'<g transform="translate(232,0)">{wordmark(WHITE)}</g>', "Br3thr"),
}
for name, body in files.items():
    (OUT / name).write_text(body)
print("written:", ", ".join(files))
