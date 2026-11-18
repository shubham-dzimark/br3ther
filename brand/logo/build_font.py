"""Builds "Br3thr Display", a tiny web font of the wordmark's own letters
(B, R, 3, T, H, plus E as the mirrored 3), so the BR3THR wordmark on the site
is live text in the logo's exact shapes instead of pictures of letters.

Run with a Python that has fontTools:
    python build_font.py  ->  ../../public/site/br3thr-display.woff (+ .otf)
"""
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.areaPen import AreaPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

from build_concepts import B, R, T, H, THREE  # SVG glyphs, cap height 120

import re

UPM = 1000
CAP = 700
S = CAP / 120
GAP = 14  # logo letter gap, in glyph units

SOURCES = {"B": (B, 90), "R": (R, 96), "three": (THREE, 82), "T": (T, 88), "H": (H, 88)}


def subpaths(svg_path_d: str):
    """Split one SVG path into closed subpaths, each as a RecordingPen in font units."""
    rec = RecordingPen()
    parse_path(svg_path_d, TransformPen(rec, (S, 0, 0, -S, 0, 120 * S)))
    out, cur = [], []
    for op, args in rec.value:
        cur.append((op, args))
        if op in ("closePath", "endPath"):
            r = RecordingPen()
            r.value = cur
            out.append(r)
            cur = []
    return out


def area(rec: RecordingPen) -> float:
    p = AreaPen()
    rec.replay(p)
    return p.value


def glyph_charstring(fn, width):
    svg = fn(0)
    paths = re.findall(r'<path( fill-rule="evenodd")? d="([^"]+)"', svg)
    adv = round((width + GAP) * S)
    pen = T2CharStringPen(adv, None)
    for evenodd, d in paths:
        parts = subpaths(d)
        for i, rec in enumerate(parts):
            outer = (i == 0) or not evenodd
            a = area(rec)
            # PostScript outlines: outer contours counter-clockwise (positive area), holes clockwise.
            if (outer and a < 0) or (not outer and a > 0):
                rec.replay(ReverseContourPen(pen))
            else:
                rec.replay(pen)
    return pen.getCharString(), adv


def build():
    order = [".notdef", "space", "B", "R", "three", "T", "H", "E"]
    cs, widths = {}, {}
    empty = T2CharStringPen(500, None)
    cs[".notdef"], widths[".notdef"] = empty.getCharString(), 500
    sp = T2CharStringPen(round(40 * S), None)
    cs["space"], widths["space"] = sp.getCharString(), round(40 * S)
    for name, (fn, w) in SOURCES.items():
        cs[name], widths[name] = glyph_charstring(fn, w)
    # E is drawn as the mirrored 3 the wordmark is built on
    cs["E"], widths["E"] = glyph_charstring(THREE, 82)

    fb = FontBuilder(UPM, isTTF=False)
    fb.setupGlyphOrder(order)
    cmap = {0x20: "space", ord("B"): "B", ord("R"): "R", ord("3"): "three", ord("T"): "T", ord("H"): "H", ord("E"): "E",
            ord("b"): "B", ord("r"): "R", ord("t"): "T", ord("h"): "H", ord("e"): "E"}
    fb.setupCharacterMap(cmap)
    fb.setupCFF("Br3thrDisplay-Regular", {"FullName": "Br3thr Display"}, cs, {})
    fb.setupHorizontalMetrics({g: (widths[g], 0) for g in order})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": "Br3thr Display", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, sTypoLineGap=0, usWinAscent=800, usWinDescent=200,
                sCapHeight=CAP, sxHeight=CAP, achVendID="BR3T", fsType=0)
    fb.setupPost()

    out = Path(__file__).resolve().parents[2] / "public" / "site"
    otf = out / "br3thr-display.otf"
    fb.save(str(otf))
    fb.font.flavor = "woff"
    fb.save(str(out / "br3thr-display.woff"))
    print("written", otf, "and .woff")


if __name__ == "__main__":
    build()
