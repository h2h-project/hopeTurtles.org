"""Sail cutout object: the flat 1:1 sail membrane shape (trapezoid + fold-over
tabs), for printing or plotting a full-size cutting pattern.

This is the soft-goods counterpart to objects/sails.py, which draws the
*wooden frame* the membrane attaches to but deliberately never draws the sail
itself (it is fabric/mylar, not a sawn part -- see that module's docstring).
Both installed sails are the identical trapezoid (the second is the first
rotated 180 degrees in-plane, not mirrored -- see lib/sail_frame.scad
sails_native_assembly()), so this pattern is cut twice from one shape.

Geometry: the trapezoid's four corner radii/heights (sail_inner_radius,
sail_top_outer_radius, sail_bottom_outer_radius, sail_height) come straight
from objects/sails.py::derive_dimensions() -- the same cage/bar/batten chain
lib/sail_frame.scad uses -- so this module does not re-derive or duplicate
that formula chain. It only adds the straight fold-over tab at the top and
bottom edge (height = wood_thickness, matching lib/sail_frame.scad's
sail_tab_height = board_width, added 2026-09-09) and the SVG/PDF writers for
the resulting 6-point polygon.

Upstream contract: every dimensional input here is a subset of
objects/sails.py's DEFAULTS/TUNING -- do not add a field this module doesn't
already share with sails.py. See CLAUDE.md "Turtle Generator".
"""
from __future__ import annotations

import json
import math
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from common import (
    DESIGN_VERSION,
    LICENSE_ID,
    GeneratedFile,
    _to_float,
    _slugify,
    _ceil_mm,
    _svg_header,
    _polygon,
    _label,
    _register_fonts,
    _draw_dimension_line,
    _rounded_rect_text,
    colors,
    canvas,
)
from objects.sails import (
    DEFAULTS as SAILS_DEFAULTS,
    TUNING as SAILS_TUNING,
    SailsInputs,
    derive_dimensions as _sails_derive_dimensions,
)

OBJECT_TYPE = "sail_cutout"

SUPPORTED_FORMATS: Tuple[str, ...] = ("pdf", "svg")

# One shape, cut twice -- the second sail is this same outline rotated 180
# degrees in-plane (see module docstring), not a separate pattern.
PART_QUANTITIES = {
    "Sail": 2,
}

# Form-driven inputs, a subset of objects/sails.py's own DEFAULTS/TUNING --
# kept as direct references so a change to the sail geometry chain upstream
# (turtle_body/lib/params.scad -> objects/sails.py) is automatically picked
# up here too.
DEFAULTS = {
    "wood_thickness": SAILS_DEFAULTS["wood_thickness"],
    "bottle_diameter": SAILS_DEFAULTS["bottle_diameter"],
    "bottle_height": SAILS_DEFAULTS["bottle_height"],
    "cap_diameter": SAILS_DEFAULTS["cap_diameter"],
    "cap_height": SAILS_DEFAULTS["cap_height"],
    "collar_diameter": SAILS_DEFAULTS["collar_diameter"],
    "top_dome_height": SAILS_DEFAULTS["top_dome_height"],
    "bottom_dome_height": SAILS_DEFAULTS["bottom_dome_height"],
}

TUNING = {
    "side_batten_height": SAILS_TUNING["side_batten_height"],
}


@dataclass(frozen=True)
class SailCutoutInputs:
    wood_thickness: float = DEFAULTS["wood_thickness"]
    bottle_diameter: float = DEFAULTS["bottle_diameter"]
    bottle_height: float = DEFAULTS["bottle_height"]
    cap_diameter: float = DEFAULTS["cap_diameter"]
    cap_height: float = DEFAULTS["cap_height"]
    collar_diameter: float = DEFAULTS["collar_diameter"]
    top_dome_height: float = DEFAULTS["top_dome_height"]
    bottom_dome_height: float = DEFAULTS["bottom_dome_height"]
    side_batten_height: float = TUNING["side_batten_height"]

    bottle_brand: str = "generic"
    formats: Tuple[str, ...] = ("pdf", "svg")
    job_id: str = ""
    lang: str = "en"


@dataclass(frozen=True)
class SailCutoutDerived:
    sail_inner_radius: float
    sail_top_outer_radius: float
    sail_bottom_outer_radius: float
    sail_height: float
    tab_height: float
    # Local (x, y) mm, one sail with its tabs, origin at the inner/bottom
    # corner of the trapezoid proper (tabs extend to negative/over-height y).
    polygon: Tuple[Tuple[float, float], ...]
    width_mm: float
    height_mm: float


def _sail_shape(inputs: SailCutoutInputs):
    """Delegate to objects/sails.py for the trapezoid's own corner
    radii/height -- see module docstring. cage_mount_hole_diameter is left at
    its sails.py default: it only places the battens' M3 holes, which this
    module never draws."""
    sails_inputs = SailsInputs(
        wood_thickness=inputs.wood_thickness,
        bottle_diameter=inputs.bottle_diameter,
        bottle_height=inputs.bottle_height,
        cap_diameter=inputs.cap_diameter,
        cap_height=inputs.cap_height,
        collar_diameter=inputs.collar_diameter,
        top_dome_height=inputs.top_dome_height,
        bottom_dome_height=inputs.bottom_dome_height,
        side_batten_height=inputs.side_batten_height,
        bottle_brand=inputs.bottle_brand,
        formats=(),
        job_id=inputs.job_id,
        lang=inputs.lang,
    )
    return _sails_derive_dimensions(sails_inputs)


def parse_inputs_from_dict(data: Dict[str, object]) -> SailCutoutInputs:
    """Parse the JSON payload Node sends (snake_case keys, see
    utils/ecojoinerGenerator.js::mapSailCutoutFields)."""

    def get(name, default=None):
        return data[name] if name in data else default

    raw_formats = get("formats", ("pdf", "svg"))
    if isinstance(raw_formats, str):
        formats = tuple(x.strip().lower() for x in raw_formats.split(",") if x.strip())
    elif isinstance(raw_formats, (list, tuple)):
        formats = tuple(str(x).strip().lower() for x in raw_formats if str(x).strip())
    else:
        formats = ("pdf", "svg")

    kwargs = {}
    for key, default in DEFAULTS.items():
        kwargs[key] = _to_float(get(key), default)
    for key, default in TUNING.items():
        kwargs[key] = _to_float(get(key), default)

    return SailCutoutInputs(
        **kwargs,
        bottle_brand=str(get("bottle_brand", "generic") or "generic"),
        formats=formats,
        job_id=str(get("job_id", "") or ""),
        lang=str(get("lang", "en") or "en").lower(),
    )


def derive_dimensions(inputs: SailCutoutInputs) -> SailCutoutDerived:
    sd = _sail_shape(inputs)
    # sail_tab_height = board_width, mirroring lib/sail_frame.scad (2026-09-09).
    tab = inputs.wood_thickness

    inner_w = 0.0
    bottom_outer_w = sd.sail_bottom_outer_radius - sd.sail_inner_radius
    top_outer_w = sd.sail_top_outer_radius - sd.sail_inner_radius
    h = sd.sail_height

    # Same 6-point winding as lib/sail_frame.scad's right_sail_native()
    # polygon: bottom tab -> up the outer (slanted) edge -> top tab -> back
    # down the inner (straight) edge.
    polygon = (
        (inner_w, -tab),
        (bottom_outer_w, -tab),
        (bottom_outer_w, 0.0),
        (top_outer_w, h),
        (top_outer_w, h + tab),
        (inner_w, h + tab),
    )
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]

    return SailCutoutDerived(
        sail_inner_radius=sd.sail_inner_radius,
        sail_top_outer_radius=sd.sail_top_outer_radius,
        sail_bottom_outer_radius=sd.sail_bottom_outer_radius,
        sail_height=sd.sail_height,
        tab_height=tab,
        polygon=polygon,
        width_mm=max(xs) - min(xs),
        height_mm=max(ys) - min(ys),
    )


def validate_inputs(inputs: SailCutoutInputs) -> List[str]:
    errors: List[str] = []
    for value, label in (
        (inputs.wood_thickness, "Wood thickness"),
        (inputs.bottle_diameter, "Bottle diameter"),
        (inputs.bottle_height, "Bottle height"),
        (inputs.cap_diameter, "Cap diameter"),
        (inputs.cap_height, "Cap height"),
        (inputs.collar_diameter, "Collar diameter"),
        (inputs.top_dome_height, "Top dome height"),
        (inputs.bottom_dome_height, "Bottom dome height"),
        (inputs.side_batten_height, "Batten height"),
    ):
        if value is None or value <= 0:
            errors.append(f"{label} must be greater than 0.")
    if errors:
        return errors

    d = derive_dimensions(inputs)
    checks = [
        (d.sail_top_outer_radius > d.sail_inner_radius, "The top rail leaves no width for the sail."),
        (d.sail_bottom_outer_radius > d.sail_top_outer_radius, "The lower sail rail must extend beyond the upper rail."),
        (d.sail_height > 0, "The sail rails leave no vertical space for the sail - try a taller batten."),
    ]
    for ok, message in checks:
        if not ok:
            errors.append(message)
    return errors


def notices(inputs: SailCutoutInputs) -> List[str]:
    return []


def make_job_slug(inputs: SailCutoutInputs, derived: SailCutoutDerived) -> str:
    brand = _slugify(inputs.bottle_brand)
    job_id = _slugify(inputs.job_id or uuid.uuid4().hex[:8], fallback=uuid.uuid4().hex[:8])
    return f"sailcutout_{brand}_{round(derived.width_mm):g}x{round(derived.height_mm):g}_{job_id}"


# ---------------------------------------------------------------------------
# SVG - a single 1:1 outline. Unlike the PDF, an SVG has no fixed page size,
# so the whole pattern (any bottle size) always fits in one file.
# ---------------------------------------------------------------------------

def write_svg(path: Path, inputs: SailCutoutInputs, d: SailCutoutDerived) -> None:
    margin = 10.0
    width = d.width_mm + 2 * margin
    height = d.height_mm + 2 * margin

    # Shift the polygon so its bounding box starts at (margin, margin).
    min_x = min(p[0] for p in d.polygon)
    min_y = min(p[1] for p in d.polygon)
    pts = [(x - min_x + margin, y - min_y + margin) for x, y in d.polygon]

    out = _svg_header(width, height, desc=f"Flatpack Sail Cutout v{DESIGN_VERSION}, 1:1 millimetre geometry")
    out += f'  <metadata>{json.dumps({"version": DESIGN_VERSION, "license": LICENSE_ID})}</metadata>\n'
    out += _polygon(pts)
    out += _label(margin, margin - 3, f"Sail (x2, cut twice - the second is this shape rotated 180deg)")
    out += "</svg>\n"
    path.write_text(out, encoding="utf-8")


# ---------------------------------------------------------------------------
# PDF - printed 1:1 on A3. Tiled across multiple A3 pages (with an overlap
# margin and registration crosses) whenever the pattern is too large for a
# single sheet, which only happens for a bottle well outside the reference
# size -- the default 82mm-bottle sail (~213 x 175mm) fits one landscape A3
# comfortably.
# ---------------------------------------------------------------------------

_A3_MARGIN_MM = 15.0
_A3_HEADER_MM = 22.0
_A3_OVERLAP_MM = 15.0
_A3_TICK_STEP_MM = 50.0


def _usable_area_mm(page_w_mm: float, page_h_mm: float) -> Tuple[float, float]:
    return (
        page_w_mm - 2 * _A3_MARGIN_MM,
        page_h_mm - 2 * _A3_MARGIN_MM - _A3_HEADER_MM,
    )


def _tile_counts(width_mm: float, height_mm: float, page_w_mm: float, page_h_mm: float) -> Tuple[int, int]:
    usable_w, usable_h = _usable_area_mm(page_w_mm, page_h_mm)
    cols = 1 if width_mm <= usable_w else 1 + math.ceil(
        (width_mm - usable_w) / (usable_w - _A3_OVERLAP_MM)
    )
    rows = 1 if height_mm <= usable_h else 1 + math.ceil(
        (height_mm - usable_h) / (usable_h - _A3_OVERLAP_MM)
    )
    return cols, rows


def write_pdf(path: Path, inputs: SailCutoutInputs, d: SailCutoutDerived, *, font_dir: Optional[Path] = None) -> None:
    """A3 sail cutting pattern, 1:1 scale.

    Single landscape-A3 page for any bottle at or near the reference size.
    If the pattern is too large for one sheet, it is tiled across multiple
    A3 pages (constant _A3_OVERLAP_MM overlap, with registration crosses on
    a _A3_TICK_STEP_MM grid printed identically on every page that covers a
    given point) so the sheets can be taped together into the full 1:1
    pattern -- each page's header names its position in the sheet grid.
    """
    if canvas is None:
        raise RuntimeError("ReportLab is not installed. Install with: pip install reportlab")
    from reportlab.lib.pagesizes import A3, landscape, portrait
    from reportlab.lib.units import mm as MM

    title_font, body_font, _mono_font = _register_fonts(font_dir)

    # Pick landscape or portrait A3, whichever needs fewer tiles for this
    # pattern (landscape wins ties, since the default reference sail is
    # wider than it is tall).
    land_w, land_h = landscape(A3)
    port_w, port_h = portrait(A3)
    land_cols, land_rows = _tile_counts(d.width_mm, d.height_mm, land_w / MM, land_h / MM)
    port_cols, port_rows = _tile_counts(d.width_mm, d.height_mm, port_w / MM, port_h / MM)
    if port_cols * port_rows < land_cols * land_rows:
        page_w, page_h = port_w, port_h
        cols, rows = port_cols, port_rows
    else:
        page_w, page_h = land_w, land_h
        cols, rows = land_cols, land_rows

    page_w_mm, page_h_mm = page_w / MM, page_h / MM
    usable_w, usable_h = _usable_area_mm(page_w_mm, page_h_mm)
    step_w = usable_w if cols == 1 else usable_w - _A3_OVERLAP_MM
    step_h = usable_h if rows == 1 else usable_h - _A3_OVERLAP_MM

    # Shift the polygon so its bounding box starts at the drawing origin
    # (0, 0) in "pattern space" mm, independent of any page.
    min_x = min(p[0] for p in d.polygon)
    min_y = min(p[1] for p in d.polygon)
    poly = [(x - min_x, y - min_y) for x, y in d.polygon]

    c = canvas.Canvas(str(path), pagesize=(page_w, page_h))
    c.setTitle(f"Flatpack Sail Cutout v{DESIGN_VERSION}")

    def mmx(v):
        return v * MM

    for row in range(rows):
        for col in range(cols):
            tile_ox = col * step_w
            # Pattern-space y grows upward; PDF/tile rows are laid out top
            # to bottom, so row 0 is the tile covering the tallest y values.
            tile_oy = (rows - 1 - row) * step_h

            c.saveState()
            # Clip to the printable area (inside the outer margin) so a
            # polygon edge that runs past this tile's usable region does
            # not bleed into the header/margin whitespace.
            clip = c.beginPath()
            clip.rect(mmx(_A3_MARGIN_MM), mmx(_A3_MARGIN_MM), mmx(usable_w), mmx(usable_h))
            c.clipPath(clip, stroke=0, fill=0)

            # ---- registration grid (drawn first, under the cut line) ----
            # Ticks sit on a grid fixed in pattern space (absolute mm, not
            # tile-local), so an overlapping neighbour tile prints the exact
            # same cross at the exact same pattern coordinate - aligning any
            # two adjacent sheets' crosses lines up the whole pattern.
            c.setStrokeColor(colors.HexColor("#cccccc"))
            c.setLineWidth(0.3)
            tick = 4.0
            for xg in _grid_lines(tile_ox, usable_w):
                px = mmx(_A3_MARGIN_MM + (xg - tile_ox))
                for yg in _grid_lines(tile_oy, usable_h):
                    py = mmx(_A3_MARGIN_MM + (yg - tile_oy))
                    c.line(px - mmx(tick), py, px + mmx(tick), py)
                    c.line(px, py - mmx(tick), px, py + mmx(tick))
                    c.setFont(body_font, 4)
                    c.setFillColor(colors.HexColor("#999999"))
                    c.drawString(px + 1.5, py + 1.5, f"{_ceil_mm(xg)},{_ceil_mm(yg)}")

            # ---- the actual 1:1 cut line, translated into this tile ----
            c.setStrokeColor(colors.HexColor("#111111"))
            c.setLineWidth(0.6)
            path_obj = c.beginPath()
            first = True
            for px, py in poly:
                ppx = mmx(_A3_MARGIN_MM + (px - tile_ox))
                ppy = mmx(_A3_MARGIN_MM + (py - tile_oy))
                if first:
                    path_obj.moveTo(ppx, ppy)
                    first = False
                else:
                    path_obj.lineTo(ppx, ppy)
            path_obj.close()
            c.drawPath(path_obj, stroke=1, fill=0)
            c.restoreState()

            # ---- header (outside the clip, always fully drawn) ----
            c.setFont(title_font, 11)
            c.setFillColor(colors.HexColor("#111111"))
            c.drawString(mmx(_A3_MARGIN_MM), page_h - mmx(_A3_MARGIN_MM + 8), f"Flatpack Sail Cutout v{DESIGN_VERSION}")
            c.setFont(body_font, 7)
            c.setFillColor(colors.HexColor("#555555"))
            sheet_note = (
                f"Sheet row {row + 1}/{rows}, col {col + 1}/{cols} - 1:1 scale, do not scale to fit."
                if cols * rows > 1
                else "1:1 scale - do not scale to fit when printing."
            )
            c.drawString(mmx(_A3_MARGIN_MM), page_h - mmx(_A3_MARGIN_MM + 16), sheet_note)
            if cols * rows > 1:
                c.drawString(
                    mmx(_A3_MARGIN_MM), page_h - mmx(_A3_MARGIN_MM + 22),
                    f"Overlap {_A3_OVERLAP_MM:g}mm on each shared edge - align the numbered grid crosses, then tape.",
                )

            c.setFont(body_font, 6)
            c.setFillColor(colors.HexColor("#777777"))
            c.drawString(
                mmx(_A3_MARGIN_MM), mmx(_A3_MARGIN_MM) - 10,
                f"CERN-OHL-S-2.0. Design version {DESIGN_VERSION}. hopeturtles.org/turtles/generate "
                f"- Sail {_ceil_mm(d.width_mm)} x {_ceil_mm(d.height_mm)}mm incl. {_ceil_mm(d.tab_height)}mm tabs. Cut x2.",
            )

            c.showPage()

    c.save()


def _grid_lines(origin: float, span: float):
    """Absolute pattern-space coordinates, on the fixed _A3_TICK_STEP_MM
    grid, that fall within [origin, origin + span] (plus a one-step pad so a
    boundary tick is never dropped by floor rounding - the caller clips the
    canvas to the exact usable rect, so the pad never actually draws
    outside it)."""
    y = math.floor(origin / _A3_TICK_STEP_MM) * _A3_TICK_STEP_MM
    while y <= origin + span + _A3_TICK_STEP_MM:
        if y >= origin - 1:
            yield y
        y += _A3_TICK_STEP_MM


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------

def generate(
    inputs: SailCutoutInputs,
    output_root: Path,
    public_url_prefix: str = "/ecojoiner_exports",
    font_dir: Optional[Path] = None,
    dry_run: bool = False,
) -> Dict[str, object]:
    """Validate and write the requested files. Same manifest contract as
    objects/sails.py::generate() and its siblings."""

    errors = validate_inputs(inputs)
    if errors:
        return {"ok": False, "errors": errors}

    d = derive_dimensions(inputs)
    slug = make_job_slug(inputs, d)
    common = {
        "ok": True,
        "object_type": OBJECT_TYPE,
        "design_version": DESIGN_VERSION,
        "license": LICENSE_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "job_slug": slug,
        "inputs": asdict(inputs),
        "derived": asdict(d),
        "part_quantities": PART_QUANTITIES,
        "notices": notices(inputs),
    }

    if dry_run:
        return {**common, "dry_run": True, "files": []}

    job_dir = output_root / slug
    job_dir.mkdir(parents=True, exist_ok=True)

    files: List[GeneratedFile] = []
    if "svg" in inputs.formats:
        svg_path = job_dir / f"{slug}_1to1.svg"
        write_svg(svg_path, inputs, d)
        files.append(GeneratedFile("svg", "1:1 SVG sail pattern", str(svg_path), f"{public_url_prefix}/{slug}/{svg_path.name}"))

    if "pdf" in inputs.formats:
        pdf_path = job_dir / f"{slug}_a3_pattern.pdf"
        write_pdf(pdf_path, inputs, d, font_dir=font_dir)
        files.append(GeneratedFile("pdf", "A3 PDF sail pattern, 1:1", str(pdf_path), f"{public_url_prefix}/{slug}/{pdf_path.name}"))

    manifest = {**common, "files": [asdict(f) for f in files]}
    manifest_path = job_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    manifest["manifest_path"] = str(manifest_path)
    manifest["manifest_url"] = f"{public_url_prefix}/{slug}/manifest.json"
    return manifest
