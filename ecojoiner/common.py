"""Shared helpers for every Ecojoiner flatpack object generator.

Extracted from the original monolithic generate_exports.py so new object
types (see ecojoiner/objects/) don't have to reimplement font handling, the
SVG/DXF/PDF drawing primitives, slugifying, or the manifest file-record
shape. Object-specific logic (dataclasses, validation, geometry, part lists,
per-object write_* functions) lives in ecojoiner/objects/<name>.py instead.
"""
from __future__ import annotations

import html
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Sequence, Tuple

# ReportLab is used only for PDF generation. SVG and SCAD generation use only
# Python's standard library.
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import landscape, letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas
    from reportlab.platypus import Paragraph
except Exception:  # pragma: no cover - useful in backend deployments
    colors = None
    letter = None
    mm = None
    canvas = None
    Paragraph = None
    ParagraphStyle = None
    getSampleStyleSheet = None
    pdfmetrics = None
    TTFont = None

# ezdxf is used only for DXF generation. SVG and SCAD generation use only
# Python's standard library.
try:
    import ezdxf
except Exception:  # pragma: no cover - useful in backend deployments
    ezdxf = None


DESIGN_VERSION = "3.2"
LICENSE_ID = "CERN-OHL-S-2.0"


@dataclass(frozen=True)
class GeneratedFile:
    format: str
    label: str
    path: str
    url: str


def _to_float(value, default: Optional[float] = None) -> Optional[float]:
    """Convert form values to float while tolerating empty strings."""
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Expected a number, got {value!r}")


def _slugify(text: str, fallback: str = "generic") -> str:
    """Create a safe filename slug from user-provided brand text."""
    text = (text or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return text or fallback


def _ceil_mm(value: float) -> str:
    """Format a millimetre dimension to 1 decimal place for the PDF.

    The PDF is a scaled carpenter reference (the SVG/DXF carry the exact 1:1
    geometry). `round(value, 6)` first absorbs float noise (e.g. 12.000000001)
    before formatting. Whole-number values drop the trailing ".0" (56.0 -> "56").
    """
    text = f"{round(value, 6):.1f}"
    return text[:-2] if text.endswith(".0") else text


# ---------------------------------------------------------------------------
# SVG primitives
# ---------------------------------------------------------------------------

def _svg_header(width_mm: float, height_mm: float, desc: str = "") -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{width_mm:.3f}mm" height="{height_mm:.3f}mm" '
        f'viewBox="0 0 {width_mm:.3f} {height_mm:.3f}">\n'
        f'  <desc>{html.escape(desc or f"Flatpack Ecojoiner v{DESIGN_VERSION}, 1:1 millimetre geometry")}</desc>\n'
        f'  <style>\n'
        f'    .cut {{ fill: none; stroke: #000000; stroke-width: 0.10; }}\n'
        f'    .mark {{ fill: none; stroke: #555555; stroke-width: 0.10; stroke-dasharray: 1 1; }}\n'
        f'    .label {{ font-family: sans-serif; font-size: 5px; fill: #333333; }}\n'
        f'  </style>\n'
    )


def _rect(x: float, y: float, w: float, h: float, klass: str = "cut") -> str:
    return f'  <rect class="{klass}" x="{x:.3f}" y="{y:.3f}" width="{w:.3f}" height="{h:.3f}"/>\n'


def _circle(cx: float, cy: float, d: float, klass: str = "cut") -> str:
    r = d / 2
    return f'  <circle class="{klass}" cx="{cx:.3f}" cy="{cy:.3f}" r="{r:.3f}"/>\n'


def _polygon(points: Sequence[Tuple[float, float]], klass: str = "cut") -> str:
    coords = " ".join(f"{x:.3f},{y:.3f}" for x, y in points)
    return f'  <polygon class="{klass}" points="{coords}"/>\n'


def _label(x: float, y: float, text: str) -> str:
    return f'  <text class="label" x="{x:.3f}" y="{y:.3f}">{html.escape(text)}</text>\n'


# ---------------------------------------------------------------------------
# DXF primitives
# ---------------------------------------------------------------------------

DXF_CUT_LAYER = "CUT"
DXF_MARK_LAYER = "MARK"
DXF_LABEL_LAYER = "LABEL"


def _dxf_setup(doc) -> None:
    """Create the CUT/MARK/LABEL layers (and DASHED linetype) write_dxf() uses.

    Mirrors the SVG output's `.cut` (solid, real cut geometry) and `.mark`
    (dashed, non-cutting reference such as a nut recess) CSS classes.
    """
    if "DASHED" not in doc.linetypes:
        doc.linetypes.add("DASHED", pattern=[3.0, 2.0, -1.0])
    if DXF_CUT_LAYER not in doc.layers:
        doc.layers.add(DXF_CUT_LAYER, color=7)
    if DXF_MARK_LAYER not in doc.layers:
        doc.layers.add(DXF_MARK_LAYER, color=8, linetype="DASHED")
    if DXF_LABEL_LAYER not in doc.layers:
        doc.layers.add(DXF_LABEL_LAYER, color=3)


def _dxf_rect(msp, x: float, y: float, w: float, h: float, layer: str = DXF_CUT_LAYER) -> None:
    pline = msp.add_lwpolyline(
        [(x, y), (x + w, y), (x + w, y + h), (x, y + h)],
        dxfattribs={"layer": layer},
    )
    pline.closed = True


def _dxf_polygon(msp, points: Sequence[Tuple[float, float]], layer: str = DXF_CUT_LAYER) -> None:
    pline = msp.add_lwpolyline(list(points), dxfattribs={"layer": layer})
    pline.closed = True


def _dxf_circle(msp, cx: float, cy: float, diameter: float, layer: str = DXF_CUT_LAYER) -> None:
    msp.add_circle(center=(cx, cy), radius=diameter / 2, dxfattribs={"layer": layer})


def _dxf_label(msp, x: float, y: float, text: str) -> None:
    msp.add_text(text, dxfattribs={"layer": DXF_LABEL_LAYER, "height": 2.5, "insert": (x, y)})


# ---------------------------------------------------------------------------
# PDF primitives
# ---------------------------------------------------------------------------

def _register_fonts(font_dir: Optional[Path] = None) -> Tuple[str, str, str]:
    """Register preferred fonts, falling back to DejaVu/Helvetica.

    Place fonts here if you want exact site typography:
      ecojoiner/fonts/Arvo-Regular.ttf
      ecojoiner/fonts/Mulish-Light.ttf
      ecojoiner/fonts/Mulish-Regular.ttf

    The fallback DejaVuSans is useful because it supports the diameter symbol.
    """
    if pdfmetrics is None:
        raise RuntimeError("ReportLab is not installed. Install with: pip install reportlab")

    search_dirs = []
    if font_dir:
        search_dirs.append(font_dir)
    search_dirs.extend([
        Path.cwd() / "ecojoiner" / "fonts",
        Path.cwd() / "fonts",
        Path("/usr/share/fonts/truetype/dejavu"),
    ])

    def try_font(font_name: str, filenames: Sequence[str]) -> Optional[str]:
        for directory in search_dirs:
            for filename in filenames:
                p = directory / filename
                if p.exists():
                    pdfmetrics.registerFont(TTFont(font_name, str(p)))
                    return font_name
        return None

    title_font = try_font("ArvoRegular", ["Arvo-Regular.ttf", "Arvo.ttf"])
    body_font = try_font("MulishLight", ["Mulish-Light.ttf", "Mulish-Regular.ttf"])
    mono_font = try_font("DejaVuSans", ["DejaVuSans.ttf"])

    # If preferred fonts are missing, use DejaVuSans so symbols like diameter render.
    fallback = mono_font or "Helvetica"
    return title_font or fallback, body_font or fallback, fallback


def _draw_dimension_line(c, x1, y1, x2, y2, text, font="Helvetica", size=7, offset=0, label_side="right", ext1=None, ext2=None, rotate_label=False):
    """Draw a simple dimension line with arrowheads and a label.

    The label's clearance from the line is computed from the label's own
    rendered width (for vertical lines) so it never visually crosses the
    line it's describing, regardless of how long the text is. `label_side`
    ("right" or "left") picks which side of a vertical line the label sits
    on, since the shape being dimensioned can be on either side of the line.

    `ext1`/`ext2`, when given as (x, y) points, are the actual feature edges
    the dimension line is measuring (the dimension line itself is often
    offset away from the geometry for legibility). A light witness/extension
    line is drawn from each feature edge out to the dimension line's
    endpoint so it is unambiguous what the arrow is pointing to.

    `rotate_label`, for vertical lines only, draws the label rotated 90
    degrees and centered directly on the line instead of offset to one
    side. Use this when the line runs through a narrow feature (like a
    slot) with no clear space beside it for a horizontal label.
    """
    if ext1 is not None or ext2 is not None:
        c.setStrokeColor(colors.HexColor("#cccccc"))
        c.setLineWidth(0.3)
        if ext1 is not None:
            c.line(ext1[0], ext1[1], x1, y1)
        if ext2 is not None:
            c.line(ext2[0], ext2[1], x2, y2)

    c.setStrokeColor(colors.HexColor("#777777"))
    c.setFillColor(colors.HexColor("#333333"))
    c.setLineWidth(0.5)
    c.line(x1, y1, x2, y2)

    # crude arrowheads; good enough for carpenter reference PDF. Scaled down
    # on very short lines (e.g. a small true-scale dimension like the
    # presser's nut-recess depth) so the two arrowheads don't cross over
    # each other and collide with the label text.
    line_len = math.hypot(x2 - x1, y2 - y1)
    ah = min(5, line_len / 3)
    c.setFont(font, size)
    text_w = c.stringWidth(text, font, size)
    if abs(x2 - x1) >= abs(y2 - y1):
        c.line(x1, y1, x1 + ah, y1 + ah / 2)
        c.line(x1, y1, x1 + ah, y1 - ah / 2)
        c.line(x2, y2, x2 - ah, y2 + ah / 2)
        c.line(x2, y2, x2 - ah, y2 - ah / 2)
        tx, ty = (x1 + x2) / 2, y1 + 5 + offset
    elif rotate_label:
        c.line(x1, y1, x1 + ah / 2, y1 + ah)
        c.line(x1, y1, x1 - ah / 2, y1 + ah)
        c.line(x2, y2, x2 + ah / 2, y2 - ah)
        c.line(x2, y2, x2 - ah / 2, y2 - ah)
        c.saveState()
        c.translate((x1 + x2) / 2, (y1 + y2) / 2)
        c.rotate(90)
        c.drawCentredString(0, 0, text)
        c.restoreState()
        return
    else:
        c.line(x1, y1, x1 + ah / 2, y1 + ah)
        c.line(x1, y1, x1 - ah / 2, y1 + ah)
        c.line(x2, y2, x2 + ah / 2, y2 - ah)
        c.line(x2, y2, x2 - ah / 2, y2 - ah)
        gap = text_w / 2 + 6 + offset
        tx = x1 - gap if label_side == "left" else x1 + gap
        ty = (y1 + y2) / 2 - size * 0.32

    c.drawCentredString(tx, ty, text)


def _draw_top_edge_with_gaps(c, x0, y_top, x1, gaps):
    """Draw a horizontal top edge as a set of segments, skipping over `gaps`.

    Each gap is an (start_x, end_x) pair in point coordinates where the slot
    notch is cut into the top edge, so that stretch of the edge is open
    material rather than a closed line.
    """
    segments_start = x0
    for gap_start, gap_end in sorted(gaps):
        if gap_start > segments_start:
            c.line(segments_start, y_top, gap_start, y_top)
        segments_start = max(segments_start, gap_end)
    if segments_start < x1:
        c.line(segments_start, y_top, x1, y_top)


def _rounded_rect_text(c, x, y, w, h, title, lines, title_font, body_font):
    c.setStrokeColor(colors.HexColor("#aaaaaa"))
    c.setFillColor(colors.HexColor("#f8f8f8"))
    c.roundRect(x, y, w, h, 5, fill=1, stroke=1)
    c.setFillColor(colors.HexColor("#222222"))
    c.setFont(title_font, 8)
    c.drawString(x + 8, y + h - 13, title)
    c.setFont(body_font, 6.5)
    yy = y + h - 24
    for line in lines:
        c.drawString(x + 8, yy, line)
        yy -= 9
