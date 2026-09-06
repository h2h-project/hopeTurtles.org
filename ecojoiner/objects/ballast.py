"""Bottom Ballast object (core slat + ballast-bottom board + lock feet +
bottom ballast fin).

Geometry and validation are ported from the standalone reference script
ecojoiner/bottom_ballast_fin_generator.py, which remains the source of truth
for the .scad output (write_scad() below calls its build_scad() directly).
This module adds the JSON-manifest/job-folder contract the rest of the
pipeline expects (see ecojoiner/objects/six_fc.py for the pattern) plus new
SVG/DXF/PDF carpenter-file writers for the assembly's four flat part shapes,
since the reference script only ever produced a 3D .scad file.

Note: the reference script's `port_length` (how far down from the top of the
core slat the neck/shoulder begins) is not a raw board/bottle measurement -
it's derived the same way the 6FC ecojoiner derives its own port_length (see
six_fc.EcojoinerInputs), from `taper_height + port_allowance` or a direct
override.
"""
from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from common import (
    DESIGN_VERSION,
    LICENSE_ID,
    DEFAULT_PORT_ALLOWANCE_MM,
    GeneratedFile,
    _to_float,
    _slugify,
    _ceil_mm,
    _svg_header,
    _rect,
    _circle,
    _polygon,
    _label,
    DXF_CUT_LAYER,
    _dxf_setup,
    _dxf_rect,
    _dxf_circle,
    _dxf_polygon,
    _dxf_label,
    _register_fonts,
    _draw_dimension_line,
    _rounded_rect_text,
    _rot_point,
    _rect_open,
    _draw_edges,
    _draw_open_path,
    _rect_edges_with_gaps,
    colors,
    letter,
    canvas,
    ezdxf,
)
from bottom_ballast_fin_generator import DEFAULTS as _BALLAST_DEFAULTS, build_scad as _ballast_build_scad

PART_QUANTITIES = {
    "Ballast Bottom Board": 1,
    "Core Slat": 2,
    "Ballast Lock Foot": 2,
    "Bottom Ballast Fin": 1,
}


@dataclass(frozen=True)
class BallastInputs:
    """Raw values for the bottom ballast assembly, after parsing.

    The 6 foundation fields come straight from the bottle/board form fields
    (Panels 2-3 of /ecojoiners/generate, the same fields "fin" reuses).
    `taper_height` (Panel 2's top-tapper field) and `port_allowance` (an
    unexposed default, same tier as 6FC's own) derive `port_length` unless a
    direct override is supplied - see derive_dimensions().
    """

    wood_thickness: float = _BALLAST_DEFAULTS["wood_thickness"]
    bottle_height: float = _BALLAST_DEFAULTS["bottle_height"]
    bottle_diameter: float = _BALLAST_DEFAULTS["bottle_diameter"]
    cap_height: float = _BALLAST_DEFAULTS["cap_height"]
    cap_diameter: float = _BALLAST_DEFAULTS["cap_diameter"]
    fin_board_width: float = _BALLAST_DEFAULTS["fin_board_width"]

    taper_height: Optional[float] = 60.0
    port_length: Optional[float] = None
    port_allowance: float = DEFAULT_PORT_ALLOWANCE_MM

    bottle_brand: str = "generic"
    formats: Tuple[str, ...] = ("pdf", "scad", "svg")
    job_id: str = ""
    lang: str = "en"


@dataclass(frozen=True)
class BallastDerived:
    port_length: float

    # Green core slat
    slat_width: float
    slat_height: float
    lower_lobe_height: float
    upper_lobe_height: float
    slot_height: float
    slot_depth: float
    neck_width: float
    shoulder_step: float
    upper_neck_start_z: float
    upper_diagonal_start_z: float
    slot_z0: float
    slot_z1: float
    lower_full_width_return_z: float
    lower_neck_start_z: float

    # Orange ballast-bottom board
    ballast_bottom_length: float
    ballast_bottom_width: float
    ballast_slot_width: float
    ballast_slot_depth: float
    center_ballast_slot_depth: float
    center_slot_center: float
    left_slot_center: float
    right_slot_center: float
    end_slot_edge_offset: float
    left_end_slot_x0: float
    right_end_slot_x0: float

    # Red ballast lock piece
    red_piece_width: float
    red_piece_height: float
    red_piece_thickness: float
    red_slot_depth: float
    red_slot_height: float
    red_chamfer: float

    # Yellow bottom ballast fin
    ballast_fin_length: float
    ballast_fin_height: float
    ballast_fin_thickness: float
    ballast_fin_lower_protrusion: float
    ballast_fin_slot_height: float
    ballast_fin_slot_depth: float
    ballast_fin_upper_cut_depth: float
    ballast_fin_upper_cut_z0: float
    ballast_fin_front_chamfer: float


def parse_inputs_from_dict(data: Dict[str, object]) -> BallastInputs:
    """Parse the JSON payload Node sends. Node already sends ready-to-use
    snake_case keys (see utils/ecojoinerGenerator.js::mapBallastFields), so
    unlike six_fc.parse_inputs_from_dict() no camelCase fallback is needed.
    """

    def get(name, default=None):
        return data[name] if name in data else default

    raw_formats = get("formats", ("pdf", "scad", "svg"))
    if isinstance(raw_formats, str):
        formats = tuple(x.strip().lower() for x in raw_formats.split(",") if x.strip())
    elif isinstance(raw_formats, (list, tuple)):
        formats = tuple(str(x).strip().lower() for x in raw_formats if str(x).strip())
    else:
        formats = ("pdf", "scad", "svg")

    kwargs = {}
    for key, default in _BALLAST_DEFAULTS.items():
        kwargs[key] = _to_float(get(key), default)

    return BallastInputs(
        **kwargs,
        taper_height=_to_float(get("taper_height"), 60.0),
        port_length=_to_float(get("port_length"), None),
        port_allowance=_to_float(get("port_allowance"), DEFAULT_PORT_ALLOWANCE_MM),
        bottle_brand=str(get("bottle_brand", "generic") or "generic"),
        formats=formats,
        job_id=str(get("job_id", "") or ""),
        lang=str(get("lang", "en") or "en").lower(),
    )


def derive_dimensions(inputs: BallastInputs) -> BallastDerived:
    t = inputs.wood_thickness
    bd = inputs.bottle_diameter
    bh = inputs.bottle_height
    ch = inputs.cap_height
    fw = inputs.fin_board_width

    port_length = inputs.port_length
    if port_length is None:
        port_length = (inputs.taper_height or 0.0) + inputs.port_allowance

    slat_width = bd - 2 * t
    slat_height = bh - ch + 4.5 * t
    lower_lobe_height = 2 * t
    upper_lobe_height = 2 * t
    slot_height = t
    slot_depth = slat_width / 2
    neck_width = bd - 3 * t
    shoulder_step = slat_width - neck_width
    upper_neck_start_z = slat_height - port_length
    upper_diagonal_start_z = upper_neck_start_z + shoulder_step
    slot_z0 = lower_lobe_height
    slot_z1 = slot_z0 + slot_height
    lower_full_width_return_z = slot_z1 + upper_lobe_height
    lower_neck_start_z = lower_full_width_return_z + shoulder_step

    ballast_bottom_length = 3.5 * bd
    ballast_bottom_width = fw
    ballast_slot_width = t
    ballast_slot_depth = fw / 3
    center_ballast_slot_depth = bd / 2
    center_slot_center = ballast_bottom_length / 2
    left_slot_center = center_slot_center - bd / 2
    right_slot_center = center_slot_center + bd / 2
    end_slot_edge_offset = 2 * t
    left_end_slot_x0 = end_slot_edge_offset
    right_end_slot_x0 = ballast_bottom_length - end_slot_edge_offset - ballast_slot_width

    red_piece_width = 5 * t
    red_piece_height = 5 * t
    red_piece_thickness = t
    red_slot_depth = red_piece_width / 2
    red_slot_height = t
    red_chamfer = 1.5 * t

    ballast_fin_length = 3 * bd
    ballast_fin_height = fw
    ballast_fin_thickness = t
    ballast_fin_lower_protrusion = 2 * t
    ballast_fin_slot_height = t
    ballast_fin_slot_depth = bd / 2
    ballast_fin_upper_cut_depth = bd
    ballast_fin_upper_cut_z0 = ballast_fin_lower_protrusion + ballast_fin_slot_height + 1.5 * t
    ballast_fin_front_chamfer = 1.5 * t

    return BallastDerived(
        port_length=port_length,
        slat_width=slat_width,
        slat_height=slat_height,
        lower_lobe_height=lower_lobe_height,
        upper_lobe_height=upper_lobe_height,
        slot_height=slot_height,
        slot_depth=slot_depth,
        neck_width=neck_width,
        shoulder_step=shoulder_step,
        upper_neck_start_z=upper_neck_start_z,
        upper_diagonal_start_z=upper_diagonal_start_z,
        slot_z0=slot_z0,
        slot_z1=slot_z1,
        lower_full_width_return_z=lower_full_width_return_z,
        lower_neck_start_z=lower_neck_start_z,
        ballast_bottom_length=ballast_bottom_length,
        ballast_bottom_width=ballast_bottom_width,
        ballast_slot_width=ballast_slot_width,
        ballast_slot_depth=ballast_slot_depth,
        center_ballast_slot_depth=center_ballast_slot_depth,
        center_slot_center=center_slot_center,
        left_slot_center=left_slot_center,
        right_slot_center=right_slot_center,
        end_slot_edge_offset=end_slot_edge_offset,
        left_end_slot_x0=left_end_slot_x0,
        right_end_slot_x0=right_end_slot_x0,
        red_piece_width=red_piece_width,
        red_piece_height=red_piece_height,
        red_piece_thickness=red_piece_thickness,
        red_slot_depth=red_slot_depth,
        red_slot_height=red_slot_height,
        red_chamfer=red_chamfer,
        ballast_fin_length=ballast_fin_length,
        ballast_fin_height=ballast_fin_height,
        ballast_fin_thickness=ballast_fin_thickness,
        ballast_fin_lower_protrusion=ballast_fin_lower_protrusion,
        ballast_fin_slot_height=ballast_fin_slot_height,
        ballast_fin_slot_depth=ballast_fin_slot_depth,
        ballast_fin_upper_cut_depth=ballast_fin_upper_cut_depth,
        ballast_fin_upper_cut_z0=ballast_fin_upper_cut_z0,
        ballast_fin_front_chamfer=ballast_fin_front_chamfer,
    )


def validate_inputs(inputs: BallastInputs) -> List[str]:
    """Real-world/geometric sanity checks. Ported from the reference
    script's validate() (bottom_ballast_fin_generator.py), collecting every
    failing check rather than raising on the first, matching six_fc's/
    back_fin's validate_inputs() contract."""

    errors: List[str] = []

    positive_fields = [
        (inputs.wood_thickness, "Wood thickness"),
        (inputs.bottle_diameter, "Bottle diameter"),
        (inputs.bottle_height, "Bottle height"),
        (inputs.cap_diameter, "Cap diameter"),
        (inputs.cap_height, "Cap height"),
        (inputs.fin_board_width, "Board width"),
    ]
    for value, label in positive_fields:
        if value is None or value <= 0:
            errors.append(f"{label} must be greater than 0.")

    if inputs.port_length is None and inputs.taper_height is None:
        errors.append("Provide either a port length or a top tapper height.")
    if inputs.port_allowance < 0:
        errors.append("Port allowance must be zero or greater.")

    if errors:
        # Downstream geometry (derive_dimensions) assumes every field above
        # is a usable positive number, so stop here rather than risk a
        # ZeroDivisionError or nonsense derived value.
        return errors

    t = inputs.wood_thickness
    d = derive_dimensions(inputs)

    checks = [
        (
            inputs.bottle_diameter > 3 * t,
            "Bottle diameter must be greater than 3x the wood thickness, so the core slat's neck width stays positive.",
        ),
        (
            d.port_length > t,
            "The top tapper height (plus allowance) must be greater than the wood thickness, so the core slat's shoulder has somewhere to sit.",
        ),
        (
            inputs.fin_board_width > 4.5 * t,
            "Board width is too small for the bottom ballast fin's lower slot and upper relief cut.",
        ),
        (
            d.ballast_bottom_length > inputs.bottle_diameter + t,
            "Bottle diameter is too large for the ballast-bottom board's end slots to clear the board ends.",
        ),
    ]
    for ok, message in checks:
        if not ok:
            errors.append(message)
    return errors


def make_job_slug(inputs: BallastInputs, derived: BallastDerived) -> str:
    brand = _slugify(inputs.bottle_brand)
    job_id = _slugify(inputs.job_id or uuid.uuid4().hex[:8], fallback=uuid.uuid4().hex[:8])
    return f"ballast_{brand}_{round(derived.ballast_bottom_length):g}x{round(derived.ballast_bottom_width):g}_{job_id}"


# ---------------------------------------------------------------------------
# SCAD - delegates straight to the validated reference generator
# ---------------------------------------------------------------------------

def write_scad(path: Path, inputs: BallastInputs, d: BallastDerived) -> None:
    overrides = {key: getattr(inputs, key) for key in _BALLAST_DEFAULTS}
    path.write_text(_ballast_build_scad(overrides, d.port_length), encoding="utf-8")


# ---------------------------------------------------------------------------
# Shared profile geometry (used by SVG, DXF and PDF writers alike)
# ---------------------------------------------------------------------------

def _slat_outline(d: BallastDerived):
    """Green core slat outline - the lower slot is already part of this one
    polygon's path (it walks in and back out), not a separate cut."""
    return [
        (0, 0),
        (d.slat_width, 0),
        (d.slat_width, d.slat_height),
        (0, d.slat_height),
        (0, d.upper_diagonal_start_z),
        (d.shoulder_step, d.upper_neck_start_z),
        (d.shoulder_step, d.lower_neck_start_z),
        (0, d.lower_full_width_return_z),
        (0, d.slot_z1),
        (d.slot_depth, d.slot_z1),
        (d.slot_depth, d.slot_z0),
        (0, d.slot_z0),
    ]


def _board_notches(d: BallastDerived):
    return [
        (d.left_slot_center - d.ballast_slot_width / 2, 0, d.ballast_slot_width, d.ballast_slot_depth),
        (d.center_slot_center - d.ballast_slot_width / 2, 0, d.ballast_slot_width, d.center_ballast_slot_depth),
        (d.right_slot_center - d.ballast_slot_width / 2, 0, d.ballast_slot_width, d.ballast_slot_depth),
        (d.left_end_slot_x0, d.ballast_bottom_width - d.ballast_slot_depth, d.ballast_slot_width, d.ballast_slot_depth),
        (d.right_end_slot_x0, d.ballast_bottom_width - d.ballast_slot_depth, d.ballast_slot_width, d.ballast_slot_depth),
    ]


def _lock_outline(d: BallastDerived):
    """Red ballast lock piece outline - both 45-degree chamfers and the
    slot notch are already part of this one polygon's path."""
    slot_y0 = (d.red_piece_height - d.red_slot_height) / 2
    slot_y1 = slot_y0 + d.red_slot_height
    return [
        (0, 0),
        (d.red_piece_width - d.red_chamfer, 0),
        (d.red_piece_width, d.red_chamfer),
        (d.red_piece_width, d.red_piece_height - d.red_chamfer),
        (d.red_piece_width - d.red_chamfer, d.red_piece_height),
        (0, d.red_piece_height),
        (0, slot_y1),
        (d.red_slot_depth, slot_y1),
        (d.red_slot_depth, slot_y0),
        (0, slot_y0),
    ]


def _yellow_fin_outline(d: BallastDerived):
    return [
        (d.ballast_fin_front_chamfer, 0),
        (d.ballast_fin_length, 0),
        (d.ballast_fin_length, d.ballast_fin_height),
        (0, d.ballast_fin_height),
        (0, d.ballast_fin_front_chamfer),
    ]


def _yellow_fin_notches(d: BallastDerived):
    lower_slot = (0.0, d.ballast_fin_lower_protrusion, d.ballast_fin_slot_depth, d.ballast_fin_slot_height)
    upper_relief = (
        0.0, d.ballast_fin_upper_cut_z0,
        d.ballast_fin_upper_cut_depth, d.ballast_fin_height - d.ballast_fin_upper_cut_z0,
    )
    return lower_slot, upper_relief


# ---------------------------------------------------------------------------
# SVG
# ---------------------------------------------------------------------------

def write_svg(path: Path, inputs: BallastInputs, d: BallastDerived, *, full_set: bool = True) -> None:
    """Write a 1:1 SVG cutting file for the assembly's 4 part shapes.

    full_set=True draws all physical quantities (Core Slat x2, Ballast-Bottom
    Board x1, Ballast Lock Foot x2, Bottom Ballast Fin x1). full_set=False
    draws one of each, the slat and lock foot labeled "x2" - same convention
    as six_fc.write_svg()/back_fin.write_svg().
    """
    margin = 10.0
    gap = 14.0
    width = margin * 2 + max(d.slat_width, d.ballast_bottom_length, d.red_piece_width, d.ballast_fin_length)

    def group(y, name, body):
        out = f'  <g id="{name.lower().replace(" ", "_")}" transform="translate({margin:.3f} {y:.3f})">\n'
        out += body
        out += _label(0, -3, name)
        out += "  </g>\n"
        return out

    def slat_group(y, name):
        return group(y, name, _polygon(_slat_outline(d)))

    def board_group(y, name):
        body = _rect(0, 0, d.ballast_bottom_length, d.ballast_bottom_width)
        for nx, ny, nw, nh in _board_notches(d):
            body += _rect(nx, ny, nw, nh)
        return group(y, name, body)

    def lock_group(y, name):
        return group(y, name, _polygon(_lock_outline(d)))

    def fin_group(y, name):
        body = _polygon(_yellow_fin_outline(d))
        for nx, ny, nw, nh in _yellow_fin_notches(d):
            body += _rect(nx, ny, nw, nh)
        return group(y, name, body)

    rows = []
    if full_set:
        rows.append((d.slat_height, lambda y: slat_group(y, "Core Slat 1")))
        rows.append((d.slat_height, lambda y: slat_group(y, "Core Slat 2")))
        rows.append((d.ballast_bottom_width, lambda y: board_group(y, "Ballast Bottom Board")))
        rows.append((d.red_piece_height, lambda y: lock_group(y, "Ballast Lock Foot 1")))
        rows.append((d.red_piece_height, lambda y: lock_group(y, "Ballast Lock Foot 2")))
        rows.append((d.ballast_fin_height, lambda y: fin_group(y, "Bottom Ballast Fin")))
    else:
        rows.append((d.slat_height, lambda y: slat_group(y, "Core Slat x2")))
        rows.append((d.ballast_bottom_width, lambda y: board_group(y, "Ballast Bottom Board")))
        rows.append((d.red_piece_height, lambda y: lock_group(y, "Ballast Lock Foot x2")))
        rows.append((d.ballast_fin_height, lambda y: fin_group(y, "Bottom Ballast Fin")))

    height = margin + sum(h + gap for h, _ in rows)

    out = _svg_header(width, height, desc=f"Flatpack Ecojoiner Bottom Ballast v{DESIGN_VERSION}, 1:1 millimetre geometry")
    out += f'  <metadata>{json.dumps({"version": DESIGN_VERSION, "license": LICENSE_ID})}</metadata>\n'
    y = margin
    for row_h, draw in rows:
        out += draw(y)
        y += row_h + gap
    out += "</svg>\n"
    path.write_text(out, encoding="utf-8")


# ---------------------------------------------------------------------------
# DXF
# ---------------------------------------------------------------------------

def write_dxf(path: Path, inputs: BallastInputs, d: BallastDerived, *, full_set: bool = True) -> None:
    """DXF equivalent of write_svg() - same row layout, DXF entities instead
    of SVG element strings. See six_fc.write_dxf()/back_fin.write_dxf() for
    the same pattern."""
    if ezdxf is None:
        raise RuntimeError("ezdxf is not installed. Install with: pip install ezdxf")

    doc = ezdxf.new(dxfversion="R2010")
    doc.units = ezdxf.units.MM
    _dxf_setup(doc)
    msp = doc.modelspace()

    margin = 10.0
    gap = 14.0

    def slat_group(y, name):
        _dxf_polygon(msp, [(x, y0 + y) for x, y0 in _slat_outline(d)], DXF_CUT_LAYER)
        _dxf_label(msp, 0, y - 3, name)

    def board_group(y, name):
        _dxf_rect(msp, 0, y, d.ballast_bottom_length, d.ballast_bottom_width, DXF_CUT_LAYER)
        for nx, ny, nw, nh in _board_notches(d):
            _dxf_rect(msp, nx, y + ny, nw, nh, DXF_CUT_LAYER)
        _dxf_label(msp, 0, y - 3, name)

    def lock_group(y, name):
        _dxf_polygon(msp, [(x, y0 + y) for x, y0 in _lock_outline(d)], DXF_CUT_LAYER)
        _dxf_label(msp, 0, y - 3, name)

    def fin_group(y, name):
        _dxf_polygon(msp, [(x, y0 + y) for x, y0 in _yellow_fin_outline(d)], DXF_CUT_LAYER)
        for nx, ny, nw, nh in _yellow_fin_notches(d):
            _dxf_rect(msp, nx, y + ny, nw, nh, DXF_CUT_LAYER)
        _dxf_label(msp, 0, y - 3, name)

    rows = []
    if full_set:
        rows.append((d.slat_height, lambda y: slat_group(y, "Core Slat 1")))
        rows.append((d.slat_height, lambda y: slat_group(y, "Core Slat 2")))
        rows.append((d.ballast_bottom_width, lambda y: board_group(y, "Ballast Bottom Board")))
        rows.append((d.red_piece_height, lambda y: lock_group(y, "Ballast Lock Foot 1")))
        rows.append((d.red_piece_height, lambda y: lock_group(y, "Ballast Lock Foot 2")))
        rows.append((d.ballast_fin_height, lambda y: fin_group(y, "Bottom Ballast Fin")))
    else:
        rows.append((d.slat_height, lambda y: slat_group(y, "Core Slat x2")))
        rows.append((d.ballast_bottom_width, lambda y: board_group(y, "Ballast Bottom Board")))
        rows.append((d.red_piece_height, lambda y: lock_group(y, "Ballast Lock Foot x2")))
        rows.append((d.ballast_fin_height, lambda y: fin_group(y, "Bottom Ballast Fin")))

    y = margin
    for row_h, draw in rows:
        draw(y)
        y += row_h + gap

    doc.saveas(str(path))


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------

def _closed_edges(points):
    """A single self-contained polygon (no boolean-subtracted notch, the cut
    is already part of the path) as (p1, p2, []) edge triples for
    _draw_edges() - every edge is a real wall, so none carry a gap."""
    n = len(points)
    return [(points[i], points[(i + 1) % n], []) for i in range(n)]


def _yellow_fin_edges_and_notches(d: BallastDerived):
    """The bottom ballast fin's outline (pentagon with one 45-degree chamfer
    baked in, like back_fin's rear fin) plus its two notches. The lower slot
    is open on one side (left) like an ordinary notch. The large upper
    relief is open on TWO adjacent sides at once (left AND top - a corner
    bite, not a single-side notch), so its wall path and gaps are built by
    hand here instead of through _rect_open()."""
    lower_slot, upper_relief = _yellow_fin_notches(d)
    lower_wall, lower_gap = _rect_open(*lower_slot, "left")

    ux0, uy0, uw, uh = upper_relief
    bl, br, tr, tl = (ux0, uy0), (ux0 + uw, uy0), (ux0 + uw, uy0 + uh), (ux0, uy0 + uh)
    upper_wall = [bl, br, tr]
    upper_top_gap = (tr, tl)
    upper_left_gap = (tl, bl)

    p0, p1, p2, p3, p4 = _yellow_fin_outline(d)
    edges = [
        (p0, p1, []),
        (p1, p2, []),
        (p2, p3, [upper_top_gap]),
        (p3, p4, [lower_gap, upper_left_gap]),
        (p4, p0, []),
    ]
    return edges, [lower_wall, upper_wall]


def write_pdf(path: Path, inputs: BallastInputs, d: BallastDerived, *, font_dir: Optional[Path] = None) -> None:
    """One-page Letter portrait carpenter reference for the assembly's 4
    part shapes.

    The Ballast-Bottom Board and Bottom Ballast Fin are long, thin parts, so
    they're rotated 90 degrees for this reference drawing (their SVG/DXF
    exports are unrotated) to make use of the page's full vertical space.
    All four parts share one scale so they stay size-comparable to each
    other. English-only for this first pass - the 6FC PDF's full
    per-language T() table is out of scope to replicate here yet.
    """
    if canvas is None:
        raise RuntimeError("ReportLab is not installed. Install with: pip install reportlab")

    title_font, body_font, _mono_font = _register_fonts(font_dir)

    page_w, page_h = letter
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle(f"Flatpack Ecojoiner Bottom Ballast v{DESIGN_VERSION}")

    margin = 28
    title_y = page_h - 34
    c.setFont(title_font, 20)
    c.setFillColor(colors.HexColor("#111111"))
    c.drawString(margin, title_y, f"Flatpack Ecojoiner - Bottom Ballast v{DESIGN_VERSION}")
    c.setFont(body_font, 9)
    c.setFillColor(colors.HexColor("#555555"))
    c.drawString(margin, title_y - 16, "Reference sheet only - the SVG/DXF exports are the 1:1 cut files.")
    c.drawString(margin, title_y - 28, "Ballast-Bottom Board and Bottom Ballast Fin are rotated 90deg here to fit the page.")

    # Drawing area: 4 columns sharing the page's full width, each part
    # scaled identically (see the shared `scale` computed below) so the
    # parts stay size-comparable to each other. Diagrams hang from a shared
    # top line rather than a shared baseline, since the smallest part (the
    # ballast lock foot, rightmost) then leaves open space at the bottom of
    # its own column for the input/derived-dimension boxes.
    draw_left = margin
    draw_right = page_w - margin
    draw_top = title_y - 44
    draw_bottom = 40
    col_w = (draw_right - draw_left) / 4
    avail_w = col_w - 24
    diagram_top = draw_top - 20
    avail_h = diagram_top - draw_bottom - 20

    yellow_edges, yellow_notches = _yellow_fin_edges_and_notches(d)

    parts_raw = [
        {
            "name": "Core Slat (x2)",
            "w_mm": d.slat_width,
            "h_mm": d.slat_height,
            "rotate": False,
            "edges": _closed_edges(_slat_outline(d)),
            "notches": [],
            "circles": [],
        },
        {
            "name": "Ballast Bottom Board",
            "w_mm": d.ballast_bottom_length,
            "h_mm": d.ballast_bottom_width,
            "rotate": True,
            "edges": _rect_edges_with_gaps(
                0, 0, d.ballast_bottom_length, d.ballast_bottom_width,
                {"bottom": _board_notches(d)[:3], "top": _board_notches(d)[3:]},
            ),
            "notches": [
                _rect_open(*notch, side)[0]
                for notch, side in zip(_board_notches(d), ["bottom", "bottom", "bottom", "top", "top"])
            ],
            "circles": [],
        },
        {
            "name": "Bottom Ballast Fin",
            "w_mm": d.ballast_fin_length,
            "h_mm": d.ballast_fin_height,
            "rotate": True,
            "edges": yellow_edges,
            "notches": yellow_notches,
            "circles": [],
        },
        {
            "name": "Ballast Lock Foot (x2)",
            "w_mm": d.red_piece_width,
            "h_mm": d.red_piece_height,
            "rotate": False,
            "edges": _closed_edges(_lock_outline(d)),
            "notches": [],
            "circles": [],
        },
    ]

    def prepare(part):
        w_mm, h_mm = part["w_mm"], part["h_mm"]
        rotate = part["rotate"]

        def r(p):
            return _rot_point(p[0], p[1], h_mm) if rotate else p

        return {
            **part,
            "eff_w": h_mm if rotate else w_mm,
            "eff_h": w_mm if rotate else h_mm,
            "edges": [(r(p1), r(p2), [(r(g1), r(g2)) for g1, g2 in gaps]) for p1, p2, gaps in part["edges"]],
            "notches": [[r(p) for p in wall] for wall in part["notches"]],
            "circles": [(*r((cx, cy)), dia) for cx, cy, dia in part["circles"]],
        }

    parts = [prepare(p) for p in parts_raw]
    # One shared scale so the 4 parts stay size-comparable to each other,
    # rather than each independently maximizing its own column (which would
    # make the physically-smaller lock foot misleadingly large).
    scale = min(min(avail_w / p["eff_w"], avail_h / p["eff_h"]) for p in parts)

    lock_bottom = None
    lock_col_x = None
    for i, part in enumerate(parts):
        cx0 = draw_left + i * col_w
        ox = cx0 + 12
        oy = diagram_top - part["eff_h"] * scale

        c.setFont(title_font, 9)
        c.setFillColor(colors.HexColor("#222222"))
        c.drawString(ox, draw_top - 10, part["name"])

        _draw_edges(c, part["edges"], ox, oy, scale, stroke_color=colors.HexColor("#333333"), line_width=0.8)

        for wall in part["notches"]:
            _draw_open_path(c, wall, ox, oy, scale, stroke_color=colors.HexColor("#999999"), line_width=0.5)
        for cx, cy, dia in part["circles"]:
            r = (dia / 2) * scale
            c.setStrokeColor(colors.HexColor("#999999"))
            c.setLineWidth(0.5)
            c.circle(ox + cx * scale, oy + cy * scale, r, stroke=1, fill=0)

        _draw_dimension_line(
            c, ox, oy - 10, ox + part["eff_w"] * scale, oy - 10,
            f"{_ceil_mm(part['eff_w'])}mm", font=body_font, size=6.5,
        )
        _draw_dimension_line(
            c, ox - 10, oy, ox - 10, oy + part["eff_h"] * scale,
            f"{_ceil_mm(part['eff_h'])}mm", font=body_font, size=6.5, label_side="left",
        )

        if part["name"] == "Ballast Lock Foot (x2)":
            lock_bottom = oy - 24
            lock_col_x = cx0

    # The lock foot is always the smallest of the 4 parts (a 5x wood
    # thickness square, vs. the other three which scale with bottle
    # diameter/height), so its column has open space below its diagram -
    # that's where the input and derived-dimension boxes live, stacked
    # instead of side-by-side.
    input_lines = [
        f"Wood thickness: {_ceil_mm(inputs.wood_thickness)}mm",
        f"Bottle diameter: {_ceil_mm(inputs.bottle_diameter)}mm",
        f"Bottle height: {_ceil_mm(inputs.bottle_height)}mm",
        f"Cap diameter: {_ceil_mm(inputs.cap_diameter)}mm",
        f"Cap height: {_ceil_mm(inputs.cap_height)}mm",
        f"Board width: {_ceil_mm(inputs.fin_board_width)}mm",
    ]
    derived_lines = [
        f"Port length: {_ceil_mm(d.port_length)}mm",
        f"Core slat: {_ceil_mm(d.slat_width)} x {_ceil_mm(d.slat_height)}mm",
        f"Board: {_ceil_mm(d.ballast_bottom_length)} x {_ceil_mm(d.ballast_bottom_width)}mm",
        f"Lock foot: {_ceil_mm(d.red_piece_width)} x {_ceil_mm(d.red_piece_height)}mm",
        f"Fin: {_ceil_mm(d.ballast_fin_length)} x {_ceil_mm(d.ballast_fin_height)}mm",
    ]
    box_gap = 10
    box_h = 92
    box_x = lock_col_x + 6
    box_w = col_w - 12
    input_box_y = lock_bottom - box_h
    derived_box_y = input_box_y - box_gap - box_h
    _rounded_rect_text(c, box_x, input_box_y, box_w, box_h, "Input variables", input_lines, title_font, body_font)
    _rounded_rect_text(c, box_x, derived_box_y, box_w, box_h, "Derived dimensions", derived_lines, title_font, body_font)

    c.showPage()
    c.save()


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------

def generate(
    inputs: BallastInputs,
    output_root: Path,
    public_url_prefix: str = "/ecojoiner_exports",
    font_dir: Optional[Path] = None,
    dry_run: bool = False,
) -> Dict[str, object]:
    """Validate inputs and write requested export files. Mirrors
    six_fc.generate()'s/back_fin.generate()'s contract exactly (same
    manifest shape, same dry-run/file-writing/job-folder behavior)."""

    errors = validate_inputs(inputs)
    if errors:
        return {"ok": False, "errors": errors}

    d = derive_dimensions(inputs)
    slug = make_job_slug(inputs, d)

    if dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "object_type": "ballast",
            "design_version": DESIGN_VERSION,
            "license": LICENSE_ID,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "job_slug": slug,
            "inputs": asdict(inputs),
            "derived": asdict(d),
            "files": [],
        }

    job_dir = output_root / slug
    job_dir.mkdir(parents=True, exist_ok=True)

    files: List[GeneratedFile] = []

    if "scad" in inputs.formats:
        scad_path = job_dir / f"{slug}.scad"
        write_scad(scad_path, inputs, d)
        files.append(GeneratedFile("scad", "OpenSCAD source", str(scad_path), f"{public_url_prefix}/{slug}/{scad_path.name}"))

    if "svg" in inputs.formats:
        svg_path = job_dir / f"{slug}_full_set_1to1.svg"
        write_svg(svg_path, inputs, d, full_set=True)
        files.append(GeneratedFile("svg", "1:1 SVG full-set cutting file", str(svg_path), f"{public_url_prefix}/{slug}/{svg_path.name}"))

        preview_svg_path = job_dir / f"{slug}_one_each_1to1.svg"
        write_svg(preview_svg_path, inputs, d, full_set=False)
        files.append(GeneratedFile("svg", "1:1 SVG one-each layout", str(preview_svg_path), f"{public_url_prefix}/{slug}/{preview_svg_path.name}"))

    if "dxf" in inputs.formats:
        dxf_path = job_dir / f"{slug}_full_set_1to1.dxf"
        write_dxf(dxf_path, inputs, d, full_set=True)
        files.append(GeneratedFile("dxf", "1:1 DXF full-set cutting file", str(dxf_path), f"{public_url_prefix}/{slug}/{dxf_path.name}"))

        preview_dxf_path = job_dir / f"{slug}_one_each_1to1.dxf"
        write_dxf(preview_dxf_path, inputs, d, full_set=False)
        files.append(GeneratedFile("dxf", "1:1 DXF one-each layout", str(preview_dxf_path), f"{public_url_prefix}/{slug}/{preview_dxf_path.name}"))

    if "pdf" in inputs.formats:
        pdf_path = job_dir / f"{slug}_carpenter_sheet.pdf"
        write_pdf(pdf_path, inputs, d, font_dir=font_dir)
        files.append(GeneratedFile("pdf", "Letter PDF carpenter sheet", str(pdf_path), f"{public_url_prefix}/{slug}/{pdf_path.name}"))

    manifest = {
        "ok": True,
        "object_type": "ballast",
        "design_version": DESIGN_VERSION,
        "license": LICENSE_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "job_slug": slug,
        "inputs": asdict(inputs),
        "derived": asdict(d),
        "files": [asdict(f) for f in files],
    }

    manifest_path = job_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    manifest["manifest_path"] = str(manifest_path)
    manifest["manifest_url"] = f"{public_url_prefix}/{slug}/manifest.json"

    return manifest
